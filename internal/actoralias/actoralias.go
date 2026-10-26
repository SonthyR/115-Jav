// Package actoralias pairs the actor names a library uses, often translated
// by imported NFO files, with the Japanese names JavDB gives the same films.
package actoralias

import (
	"cmp"
	"context"
	"log/slog"
	"maps"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode"

	"github.com/ppxb/miyabi/internal/codeid"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/actor"
	"github.com/ppxb/miyabi/internal/ent/metadatacache"
)

// Aliases are rebuilt at most this often; cached catalogue results change slowly.
const ttl = 10 * time.Minute

// Alias is the catalogue's name, portrait and actor ID for a library actor.
type Alias struct {
	Name   string
	Avatar string
	ID     string
}

// Index builds the pairs from the metadata cache and keeps them for a while.
type Index struct {
	db         *ent.Client
	mu         sync.Mutex
	builtAt    time.Time
	generation int64
	aliases    map[string]Alias
	people     People
}

// generation counts metadata cache refills, so every index rebuilds after one.
var generation atomic.Int64

// Invalidate makes every index rebuild its pairs on next use.
func Invalidate() { generation.Add(1) }

func New(db *ent.Client) *Index { return &Index{db: db} }

// Translations lists the library names paired with a catalogue name.
func (i *Index) Translations(ctx context.Context, name string) []string {
	var names []string
	for library, alias := range i.Aliases(ctx) {
		if alias.Name == name && library != name {
			names = append(names, library)
		}
	}
	slices.Sort(names)
	return names
}

// Aliases maps library actor names to their catalogue names. A pair counts
// when a film has one unpaired actress on each side; names paired by other
// films are set aside first, so casts resolve over a few passes. The most
// frequent pairing wins, which outvotes the odd mislabelled film.
func (i *Index) Aliases(ctx context.Context) map[string]Alias {
	aliases, _ := i.load(ctx)
	return aliases
}

// People groups the library names that pairing ties to one person.
func (i *Index) People(ctx context.Context) People {
	_, people := i.load(ctx)
	return people
}

func (i *Index) load(ctx context.Context) (map[string]Alias, People) {
	if i == nil {
		return nil, People{}
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	current := generation.Load()
	if i.aliases != nil && time.Since(i.builtAt) < ttl && i.generation == current {
		return i.aliases, i.people
	}
	aliases, people, err := i.build(ctx)
	if err != nil {
		slog.WarnContext(ctx, "pair actor names with the catalogue", "error", err)
		return i.aliases, i.people
	}
	i.aliases, i.people, i.builtAt, i.generation = aliases, people, time.Now(), current
	return aliases, people
}

// People maps each library name to the name shown for its person. A person
// credited under several names, such as a Chinese and a Japanese spelling,
// is shown under the catalogue's name; one credited under a single name
// keeps it.
type People struct {
	shown map[string]string
	names map[string][]string
}

// Name is the name shown for the person credited as name.
func (p People) Name(name string) string {
	if shown, ok := p.shown[name]; ok {
		return shown
	}
	return name
}

// Names lists every library name of the person credited or shown as name.
func (p People) Names(name string) []string {
	if names, ok := p.names[p.Name(name)]; ok {
		return names
	}
	return []string{name}
}

func newPeople(cast map[string][]string, aliases map[string]Alias) People {
	groups := map[string][]string{}
	for _, names := range cast {
		for _, name := range names {
			key := name
			if alias, ok := aliases[name]; ok {
				key = alias.Name
			}
			if !slices.Contains(groups[key], name) {
				groups[key] = append(groups[key], name)
			}
		}
	}
	people := People{shown: map[string]string{}, names: map[string][]string{}}
	for key, names := range groups {
		if len(names) < 2 {
			continue
		}
		slices.Sort(names)
		people.names[key] = names
		for _, name := range names {
			people.shown[name] = key
		}
	}
	return people
}

func (i *Index) build(ctx context.Context) (map[string]Alias, People, error) {
	movies, err := i.db.Movie.Query().
		WithActors(func(query *ent.ActorQuery) {
			query.Where(actor.GenderNEQ(actor.GenderMale)).Select(actor.FieldID, actor.FieldName)
		}).All(ctx)
	if err != nil {
		return nil, People{}, err
	}
	cast := make(map[string][]string, len(movies))
	for _, record := range movies {
		code := codeid.Normalize(record.Code)
		for _, person := range record.Edges.Actors {
			if !slices.Contains(cast[code], person.Name) {
				cast[code] = append(cast[code], person.Name)
			}
		}
	}
	entries, err := i.db.MetadataCache.Query().
		Where(metadatacache.ProviderEQ("javdb"), metadatacache.ResultNotNil()).
		All(ctx)
	if err != nil {
		return nil, People{}, err
	}
	catalogue := map[string][]string{}
	avatars, ids := map[string]string{}, map[string]string{}
	for _, entry := range entries {
		if entry.Result == nil {
			continue
		}
		code := codeid.Normalize(cmp.Or(entry.Result.Detail.Code, entry.Code))
		if _, ok := cast[code]; !ok {
			continue
		}
		var names []string
		for _, person := range entry.Result.Detail.Actors {
			if person.Gender == "male" || person.Name == "" || slices.Contains(names, person.Name) {
				continue
			}
			names = append(names, person.Name)
			if person.Avatar != "" {
				avatars[person.Name] = person.Avatar
			}
			if person.ID != "" {
				ids[person.Name] = person.ID
			}
		}
		catalogue[code] = names
	}

	resolved := map[string]string{}
	for range 3 {
		votes := map[string]map[string]int{}
		for _, code := range slices.Sorted(maps.Keys(catalogue)) {
			known := catalogue[code]
			// Set aside the names this film shares or that other films paired.
			var left []string
			paired := map[string]bool{}
			for _, name := range cast[code] {
				if slices.Contains(known, name) {
					resolved[name] = name
				}
				if alias, ok := resolved[name]; ok {
					paired[alias] = true
					continue
				}
				left = append(left, name)
			}
			var right []string
			for _, name := range known {
				if !paired[name] {
					right = append(right, name)
				}
			}
			if len(left) == 1 && len(right) == 1 {
				if votes[left[0]] == nil {
					votes[left[0]] = map[string]int{}
				}
				votes[left[0]][right[0]]++
			}
		}
		if len(votes) == 0 {
			break
		}
		for name, candidates := range votes {
			best, count := "", 0
			for candidate, n := range candidates {
				if n > count || (n == count && candidate < best) {
					best, count = candidate, n
				}
			}
			resolved[name] = best
		}
	}

	pairShared(cast, catalogue, resolved)

	aliases := make(map[string]Alias, len(resolved))
	for name, alias := range resolved {
		aliases[name] = Alias{Name: alias, Avatar: avatars[alias], ID: ids[alias]}
	}
	return aliases, newPeople(cast, aliases), nil
}

// pairShared resolves names in films with several unpaired actresses. A name
// whose films leave exactly one catalogue name in common is that actress;
// otherwise the one candidate sharing the most kanji with it is, since kanji
// often survive translation (藤森里穗 / 藤森里穂).
func pairShared(cast, catalogue map[string][]string, resolved map[string]string) {
	for range 3 {
		candidates := map[string][]string{}
		// A lone candidate is trusted when films agree on it or no film
		// leaves more library names than catalogue names open.
		films, unbalanced := map[string]int{}, map[string]bool{}
		for _, code := range slices.Sorted(maps.Keys(catalogue)) {
			taken := map[string]bool{}
			for _, name := range cast[code] {
				if alias, ok := resolved[name]; ok {
					taken[alias] = true
				}
			}
			var open []string
			for _, name := range catalogue[code] {
				if !taken[name] {
					open = append(open, name)
				}
			}
			var left []string
			for _, name := range cast[code] {
				if _, ok := resolved[name]; !ok {
					left = append(left, name)
				}
			}
			for _, name := range left {
				if len(open) == 0 {
					continue
				}
				films[name]++
				unbalanced[name] = unbalanced[name] || len(left) > len(open)
				if previous, seen := candidates[name]; seen {
					candidates[name] = slices.DeleteFunc(previous, func(c string) bool { return !slices.Contains(open, c) })
				} else {
					candidates[name] = slices.Clone(open)
				}
			}
		}
		changed := false
		for _, name := range slices.Sorted(maps.Keys(candidates)) {
			trusted := films[name] > 1 || !unbalanced[name]
			if pick := closest(name, candidates[name], trusted); pick != "" {
				resolved[name], changed = pick, true
			}
		}
		if !changed {
			return
		}
	}
}

func closest(name string, candidates []string, trusted bool) string {
	if len(candidates) == 1 && trusted {
		return candidates[0]
	}
	best, bestScore, tied := "", 0, false
	for _, candidate := range candidates {
		score := 0
		for _, r := range name {
			if unicode.Is(unicode.Han, r) && strings.ContainsRune(candidate, r) {
				score++
			}
		}
		switch {
		case score > bestScore:
			best, bestScore, tied = candidate, score, false
		case score == bestScore:
			tied = true
		}
	}
	if bestScore < 2 || tied {
		return ""
	}
	return best
}

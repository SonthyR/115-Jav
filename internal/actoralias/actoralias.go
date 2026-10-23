// Package actoralias pairs the actor names a library uses, often translated
// by imported NFO files, with the Japanese names JavDB gives the same films.
package actoralias

import (
	"cmp"
	"context"
	"log/slog"
	"maps"
	"slices"
	"sync"
	"time"

	"github.com/ppxb/miyabi/internal/codeid"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/actor"
	"github.com/ppxb/miyabi/internal/ent/metadatacache"
)

// Aliases are rebuilt at most this often; cached catalogue results change slowly.
const ttl = 10 * time.Minute

// Alias is the catalogue's name and portrait for a library actor.
type Alias struct {
	Name   string
	Avatar string
}

// Index builds the pairs from the metadata cache and keeps them for a while.
type Index struct {
	db      *ent.Client
	mu      sync.Mutex
	builtAt time.Time
	aliases map[string]Alias
}

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
	if i == nil {
		return nil
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.aliases != nil && time.Since(i.builtAt) < ttl {
		return i.aliases
	}
	aliases, err := i.build(ctx)
	if err != nil {
		slog.WarnContext(ctx, "pair actor names with the catalogue", "error", err)
		return i.aliases
	}
	i.aliases, i.builtAt = aliases, time.Now()
	return aliases
}

func (i *Index) build(ctx context.Context) (map[string]Alias, error) {
	movies, err := i.db.Movie.Query().
		WithActors(func(query *ent.ActorQuery) {
			query.Where(actor.GenderNEQ(actor.GenderMale)).Select(actor.FieldID, actor.FieldName)
		}).All(ctx)
	if err != nil {
		return nil, err
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
		return nil, err
	}
	catalogue := map[string][]string{}
	avatars := map[string]string{}
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

	aliases := make(map[string]Alias, len(resolved))
	for name, alias := range resolved {
		aliases[name] = Alias{Name: alias, Avatar: avatars[alias]}
	}
	return aliases, nil
}

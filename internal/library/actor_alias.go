package library

import (
	"cmp"
	"context"
	"log/slog"
	"slices"
	"sync"
	"time"

	"github.com/ppxb/miyabi/internal/codeid"
	"github.com/ppxb/miyabi/internal/ent/metadatacache"
)

// Aliases are rebuilt at most this often; cached catalogue results change slowly.
const aliasTTL = 10 * time.Minute

// actorAlias is the catalogue's name and portrait for a library actor.
type actorAlias struct {
	Name   string
	Avatar string
}

type actorAliasCache struct {
	mu      sync.Mutex
	builtAt time.Time
	aliases map[string]actorAlias
}

// actorAliases pairs library actor names, often translated by imported NFO
// files, with the Japanese names JavDB gives the same films. A pair counts
// when a film has one unpaired actress on each side; names paired by other
// films are set aside first, so casts resolve over a few passes. The most
// frequent pairing wins, which outvotes the odd mislabelled film.
func (s *Service) actorAliases(ctx context.Context, cast map[string][]string) map[string]actorAlias {
	s.aliases.mu.Lock()
	defer s.aliases.mu.Unlock()
	if s.aliases.aliases != nil && time.Since(s.aliases.builtAt) < aliasTTL {
		return s.aliases.aliases
	}
	entries, err := s.database.MetadataCache.Query().
		Where(metadatacache.ProviderEQ("javdb"), metadatacache.ResultNotNil()).
		All(ctx)
	if err != nil {
		slog.WarnContext(ctx, "read cached catalogue actors", "error", err)
		return s.aliases.aliases
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
		for code, known := range catalogue {
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

	aliases := make(map[string]actorAlias, len(resolved))
	for name, alias := range resolved {
		aliases[name] = actorAlias{Name: alias, Avatar: avatars[alias]}
	}
	s.aliases.aliases, s.aliases.builtAt = aliases, time.Now()
	return aliases
}

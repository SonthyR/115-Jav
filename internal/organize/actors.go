package organize

import (
	"slices"
	"strings"

	"github.com/ppxb/miyabi/internal/actorname"
)

// Actor is one scraped actor with the alternative names a source reported.
type Actor struct {
	Name    string
	Aliases []string
}

// ResolveActorDirectory reuses an existing actor folder when its names match
// the movie's actors, so a library that writes 三上悠亚 keeps that spelling
// for new 三上悠亜 movies. Otherwise it returns the new folder name.
func ResolveActorDirectory(actors []Actor, max int, existing []string) string {
	names := make([]string, len(actors))
	for i, actor := range actors {
		names[i] = actor.Name
	}
	wanted := ActorDirectory(names, max)
	if wanted == UnknownActor || wanted == ManyActors {
		return wanted
	}
	byKey := make(map[string]string, len(existing))
	for _, dir := range existing {
		byKey[dirKey(strings.Split(dir, ","))] = dir
	}
	// Try each actor's own spelling, then a known alias, per position.
	resolved := make([]string, 0, len(actors))
	for _, actor := range actors {
		if SafeName(actor.Name) == "" {
			continue
		}
		resolved = append(resolved, matchSingle(actor, byKey))
	}
	if dir, ok := byKey[dirKey(resolved)]; ok {
		return dir
	}
	return ActorDirectory(resolved, max)
}

// matchSingle returns the spelling of an existing single-actor folder that
// matches the actor or one of its aliases, or the actor's own name.
func matchSingle(actor Actor, byKey map[string]string) string {
	for _, name := range append([]string{actor.Name}, actor.Aliases...) {
		if dir, ok := byKey[dirKey([]string{name})]; ok {
			return dir
		}
	}
	return actor.Name
}

// dirKey ignores the order of names in a multi-actor folder.
func dirKey(names []string) string {
	keys := make([]string, 0, len(names))
	for _, name := range names {
		if key := actorname.Key(SafeName(name)); key != "" {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	return strings.Join(keys, ",")
}

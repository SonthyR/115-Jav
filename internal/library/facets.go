package library

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"strconv"
	"sync"
	"time"

	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/actor"
	"github.com/ppxb/miyabi/internal/ent/movie"
	"github.com/ppxb/miyabi/internal/ent/tag"
)

// Facet is a filter value with the number of library movies it matches.
type Facet struct {
	Name   string `json:"name"`
	Count  int    `json:"count"`
	Avatar string `json:"avatar,omitempty"`
	// Alias is the catalogue's Japanese name for an actor whose files use a
	// translated one; portrait collections are keyed by it.
	Alias string `json:"alias,omitempty"`
	// JavDBID is the actor's JavDB ID, for browsing their catalogue works.
	JavDBID string `json:"javdb_id,omitempty"`
	// Names lists the library names merged into this actor, when several are.
	Names []string `json:"names,omitempty"`
}

type Facets struct {
	Actors []Facet `json:"actors"`
	Makers []Facet `json:"makers"`
	Series []Facet `json:"series"`
	Tags   []Facet `json:"tags"`
	Years  []Facet `json:"years"`
}

// facetsTTL matches how long actor name pairs are kept, as facets use them.
const facetsTTL = 10 * time.Minute

// facetsCache keeps the last count until the library changes; counting reads
// every movie with its actors and tags.
type facetsCache struct {
	mu    sync.Mutex
	key   string
	at    time.Time
	value Facets
}

// Facets counts the actors, makers, series, tags and release years of the
// current library, most common first; years are newest first.
func (s *Service) Facets(ctx context.Context) (Facets, error) {
	if s.tasks == nil {
		return s.countFacets(ctx)
	}
	key := fmt.Sprint(s.tasks.Revisions().Library)
	if source := s.Source(); source != nil {
		key += ":" + source.AccountID + ":" + source.Directory.ID
	}
	cache := &s.facets
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.key == key && time.Since(cache.at) < facetsTTL {
		return cache.value, nil
	}
	value, err := s.countFacets(ctx)
	if err == nil {
		cache.key, cache.at, cache.value = key, time.Now(), value
	}
	return value, err
}

func (s *Service) countFacets(ctx context.Context) (Facets, error) {
	records, err := s.database.Movie.Query().Where(movie.HasFilesWith(libraryScope(s.Source()))).
		Select(movie.FieldID, movie.FieldMakerName, movie.FieldSeriesName, movie.FieldReleaseDate).
		WithActors(func(query *ent.ActorQuery) {
			query.Where(actor.GenderNEQ(actor.GenderMale)).
				Select(actor.FieldID, actor.FieldProvider, actor.FieldSourceID, actor.FieldName, actor.FieldAvatar)
		}).
		WithTags(func(query *ent.TagQuery) { query.Select(tag.FieldID, tag.FieldName) }).
		All(ctx)
	if err != nil {
		return Facets{}, fmt.Errorf("list library facets: %w", err)
	}
	actors, makers, series, tags, years := newCounter(), newCounter(), newCounter(), newCounter(), newCounter()
	javdbIDs := map[string]string{}
	people := s.aliases.People(ctx)
	for _, record := range records {
		// A movie counts once per person, even when sources repeat or
		// translate a name.
		seen := map[string]bool{}
		for _, person := range record.Edges.Actors {
			name := people.Name(person.Name)
			if !seen[name] {
				seen[name] = true
				actors.add(name, person.Avatar)
			}
			if person.Provider == "javdb" {
				javdbIDs[name] = person.SourceID
			}
		}
		for _, label := range record.Edges.Tags {
			if !seen["tag:"+label.Name] {
				seen["tag:"+label.Name] = true
				tags.add(label.Name, nil)
			}
		}
		if record.MakerName != nil {
			makers.add(*record.MakerName, nil)
		}
		if record.SeriesName != nil {
			series.add(*record.SeriesName, nil)
		}
		if record.ReleaseDate != nil {
			years.add(strconv.Itoa(record.ReleaseDate.Year()), nil)
		}
	}
	actorFacets := actors.facets()
	aliases := s.aliases.Aliases(ctx)
	for i, facet := range actorFacets {
		actorFacets[i].JavDBID = javdbIDs[facet.Name]
		if names := people.Names(facet.Name); len(names) > 1 {
			actorFacets[i].Names = names
		}
		alias, ok := aliases[facet.Name]
		if !ok {
			// A merged actor shown under a catalogue name no film credits.
			for _, name := range people.Names(facet.Name) {
				if alias, ok = aliases[name]; ok {
					break
				}
			}
		}
		if ok {
			if alias.Name != facet.Name {
				actorFacets[i].Alias = alias.Name
			}
			if facet.Avatar == "" {
				actorFacets[i].Avatar = alias.Avatar
			}
			if actorFacets[i].JavDBID == "" {
				actorFacets[i].JavDBID = alias.ID
			}
		}
	}
	yearFacets := years.facets()
	slices.SortFunc(yearFacets, func(a, b Facet) int { return cmp.Compare(b.Name, a.Name) })
	return Facets{Actors: actorFacets, Makers: makers.facets(), Series: series.facets(), Tags: tags.facets(), Years: yearFacets}, nil
}

type counter map[string]*Facet

func newCounter() counter { return counter{} }

func (c counter) add(name string, avatar *string) {
	if name == "" {
		return
	}
	facet := c[name]
	if facet == nil {
		facet = &Facet{Name: name}
		c[name] = facet
	}
	facet.Count++
	if facet.Avatar == "" && avatar != nil {
		facet.Avatar = *avatar
	}
}

func (c counter) facets() []Facet {
	result := make([]Facet, 0, len(c))
	for _, facet := range c {
		result = append(result, *facet)
	}
	slices.SortFunc(result, func(a, b Facet) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), cmp.Compare(a.Name, b.Name))
	})
	return result
}

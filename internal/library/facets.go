package library

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"strconv"

	"github.com/ppxb/miyabi/internal/codeid"
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
}

type Facets struct {
	Actors []Facet `json:"actors"`
	Makers []Facet `json:"makers"`
	Series []Facet `json:"series"`
	Tags   []Facet `json:"tags"`
	Years  []Facet `json:"years"`
}

// Facets counts the actors, makers, series, tags and release years of the
// current library, most common first; years are newest first.
func (s *Service) Facets(ctx context.Context) (Facets, error) {
	records, err := s.database.Movie.Query().Where(movie.HasFilesWith(libraryScope(s.Source()))).
		Select(movie.FieldID, movie.FieldCode, movie.FieldMakerName, movie.FieldSeriesName, movie.FieldReleaseDate).
		WithActors(func(query *ent.ActorQuery) {
			query.Where(actor.GenderNEQ(actor.GenderMale)).Select(actor.FieldID, actor.FieldName, actor.FieldAvatar)
		}).
		WithTags(func(query *ent.TagQuery) { query.Select(tag.FieldID, tag.FieldName) }).
		All(ctx)
	if err != nil {
		return Facets{}, fmt.Errorf("list library facets: %w", err)
	}
	actors, makers, series, tags, years := newCounter(), newCounter(), newCounter(), newCounter(), newCounter()
	cast := make(map[string][]string, len(records))
	for _, record := range records {
		// A movie counts once per name, even when sources repeat a person.
		seen := map[string]bool{}
		for _, person := range record.Edges.Actors {
			if !seen[person.Name] {
				seen[person.Name] = true
				actors.add(person.Name, person.Avatar)
				cast[codeid.Normalize(record.Code)] = append(cast[codeid.Normalize(record.Code)], person.Name)
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
	aliases := s.actorAliases(ctx, cast)
	for i, facet := range actorFacets {
		if alias, ok := aliases[facet.Name]; ok {
			if alias.Name != facet.Name {
				actorFacets[i].Alias = alias.Name
			}
			if facet.Avatar == "" {
				actorFacets[i].Avatar = alias.Avatar
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

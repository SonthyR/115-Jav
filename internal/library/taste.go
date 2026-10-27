package library

import (
	"cmp"
	"context"
	"fmt"
	"slices"

	"github.com/ppxb/miyabi/internal/ent/collectionitem"
	"github.com/ppxb/miyabi/internal/ent/movie"
)

// TasteItem is a JavDB actor, tag, maker or series and how much of the
// library leans on it.
type TasteItem struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Count int    `json:"count"`
	// Weight sums the movies, counting collected and watched ones more, and is
	// relative to the heaviest item of its kind (1).
	Weight float64 `json:"weight"`
}

// Taste is what the library says about its owner's preferences.
type Taste struct {
	Movies int         `json:"movies"`
	Actors []TasteItem `json:"actors"`
	Tags   []TasteItem `json:"tags"`
	Makers []TasteItem `json:"makers"`
	Series []TasteItem `json:"series"`
}

// Movie weights: every film counts once, a film kept in a collection or
// watched says more.
const (
	tasteCollected = 2
	tastePlayed    = 1.5
	tasteStarted   = 1
)

// genericTagShare drops tags most of the library carries (高畫質, 單體作品),
// which say nothing about preference.
const genericTagShare = 0.5

// Taste weighs the JavDB actors, tags, makers and series of the library.
// Actors credited under several spellings count as one person.
func (s *Service) Taste(ctx context.Context) (Taste, error) {
	records, err := s.database.Movie.Query().Where(movie.HasFilesWith(libraryScope(s.Source()))).
		Select(movie.FieldID, movie.FieldMetadata).All(ctx)
	if err != nil {
		return Taste{}, fmt.Errorf("list library taste: %w", err)
	}
	collectedIDs, err := s.database.CollectionItem.Query().Select(collectionitem.FieldMovieID).Ints(ctx)
	if err != nil {
		return Taste{}, fmt.Errorf("list collected movies: %w", err)
	}
	collected := make(map[int]bool, len(collectedIDs))
	for _, id := range collectedIDs {
		collected[id] = true
	}
	states, err := s.PlayStates(ctx)
	if err != nil {
		return Taste{}, err
	}
	weights := make(map[int]float64, len(records))
	for _, record := range records {
		weight := 1.0
		if collected[record.ID] {
			weight += tasteCollected
		}
		if state, ok := states[record.ID]; ok && state.Played {
			weight += tastePlayed
		} else if ok && state.Position > 0 {
			weight += tasteStarted
		}
		weights[record.ID] = weight
	}

	tags, makers, series := tally{}, tally{}, tally{}
	for _, record := range records {
		if record.Metadata == nil {
			continue
		}
		doc, weight := record.Metadata, weights[record.ID]
		seen := map[string]bool{}
		for _, label := range doc.Tags {
			if label.Provider == "javdb" && label.ID != "" && !seen[label.ID] {
				seen[label.ID] = true
				tags.add(label.ID, label.Name, weight)
			}
		}
		if doc.Studio.Provider == "javdb" && doc.Studio.ID != "" {
			makers.add(doc.Studio.ID, doc.Studio.Name, weight)
		}
		if doc.Set.Provider == "javdb" && doc.Set.ID != "" {
			series.add(doc.Set.ID, doc.Set.Name, weight)
		}
	}
	for id, item := range tags {
		if float64(item.Count) > genericTagShare*float64(len(records)) {
			delete(tags, id)
		}
	}

	actors, err := s.actorTaste(ctx, weights)
	if err != nil {
		return Taste{}, err
	}
	return Taste{Movies: len(records), Actors: actors.items(), Tags: tags.items(),
		Makers: makers.items(), Series: series.items()}, nil
}

// actorTaste weighs the actresses the library can browse on JavDB.
func (s *Service) actorTaste(ctx context.Context, weights map[int]float64) (tally, error) {
	facets, err := s.Facets(ctx)
	if err != nil {
		return nil, err
	}
	ids := map[string]string{}
	for _, facet := range facets.Actors {
		if facet.JavDBID != "" {
			ids[facet.Name] = facet.JavDBID
		}
	}
	records, err := s.database.Movie.Query().Where(movie.HasFilesWith(libraryScope(s.Source()))).
		Select(movie.FieldID).WithActors().All(ctx)
	if err != nil {
		return nil, fmt.Errorf("list library actors: %w", err)
	}
	people := s.aliases.People(ctx)
	actors := tally{}
	for _, record := range records {
		seen := map[string]bool{}
		for _, person := range record.Edges.Actors {
			name := people.Name(person.Name)
			id := ids[name]
			if id == "" || seen[id] {
				continue
			}
			seen[id] = true
			actors.add(id, name, weights[record.ID])
		}
	}
	return actors, nil
}

type tally map[string]*TasteItem

func (t tally) add(id, name string, weight float64) {
	item := t[id]
	if item == nil {
		item = &TasteItem{ID: id, Name: name}
		t[id] = item
	}
	item.Count++
	item.Weight += weight
}

func (t tally) items() []TasteItem {
	result := make([]TasteItem, 0, len(t))
	heaviest := 0.0
	for _, item := range t {
		result = append(result, *item)
		heaviest = max(heaviest, item.Weight)
	}
	for i := range result {
		result[i].Weight /= heaviest
	}
	slices.SortFunc(result, func(a, b TasteItem) int {
		return cmp.Or(cmp.Compare(b.Weight, a.Weight), cmp.Compare(b.Count, a.Count), cmp.Compare(a.ID, b.ID))
	})
	return result
}

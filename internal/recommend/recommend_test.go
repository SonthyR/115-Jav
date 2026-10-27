package recommend

import (
	"context"
	"errors"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/ppxb/miyabi/internal/catalogue"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/library"
)

type fakeCatalogue struct {
	pages  map[string][]catalogue.Movie
	owned  []string
	mu     sync.Mutex
	browse int
}

func (f *fakeCatalogue) Browse(_ context.Context, options domain.BrowseOptions) ([]catalogue.Movie, error) {
	f.mu.Lock()
	f.browse++
	f.mu.Unlock()
	key := string(options.EntityType) + ":" + options.EntityID
	if len(options.TagIDs) > 0 {
		key = "tag:" + options.TagIDs[0]
	}
	movies, ok := f.pages[key]
	if !ok {
		return nil, errors.New("unavailable")
	}
	return movies, nil
}

func (f *fakeCatalogue) MovieStates(_ context.Context, identities []catalogue.MovieIdentity) ([]catalogue.MovieStateItem, error) {
	states := make([]catalogue.MovieStateItem, len(identities))
	for i, identity := range identities {
		states[i] = catalogue.MovieStateItem{ID: identity.ID, State: catalogue.MovieNotInLibrary}
		if slices.Contains(f.owned, identity.ID) {
			states[i].State = catalogue.MovieInLibrary
		}
	}
	return states, nil
}

type fakeProfile library.Taste

func (f fakeProfile) Taste(context.Context) (library.Taste, error) { return library.Taste(f), nil }

func film(id string, rating float64, magnets int) catalogue.Movie {
	movie := catalogue.Movie{ReleaseStatus: catalogue.ReleaseReleased}
	movie.ID, movie.Code, movie.Rating, movie.MagnetsCount, movie.ReleaseDate = id, id, rating, magnets, "2020-01-01"
	return movie
}

func TestRecommendationsRankFilmsSeveralTastesShare(t *testing.T) {
	upcoming := film("up", 0, 0)
	upcoming.ReleaseStatus = catalogue.ReleaseUpcoming
	fake := &fakeCatalogue{
		pages: map[string][]catalogue.Movie{
			"actor:a1": {film("owned", 4.8, 3), film("both", 3, 2), film("solo", 4.9, 1), upcoming},
			"tag:t1":   {film("both", 3, 2), film("rated", 4.9, 5), film("nomagnet", 5, 0)},
			// The maker page fails and is left out.
		},
		owned: []string{"owned"},
	}
	profile := fakeProfile{Movies: 10,
		Actors: []library.TasteItem{{ID: "a1", Name: "三上悠亞", Count: 6, Weight: 1}},
		Tags:   []library.TasteItem{{ID: "t1", Name: "巨乳", Count: 4, Weight: 1}},
		Makers: []library.TasteItem{{ID: "m1", Name: "S1", Count: 3, Weight: 1}},
	}
	service := New(fake, profile)
	result, err := service.Recommendations(t.Context(), false)
	if err != nil {
		t.Fatal(err)
	}
	ids := func(section Section) []string {
		var out []string
		for _, movie := range section.Movies {
			out = append(out, movie.ID)
		}
		return out
	}
	if len(result.Sections) != 3 {
		t.Fatalf("sections = %+v", result.Sections)
	}
	// A film both the actress and the tag bring beats better rated ones; owned,
	// upcoming and magnetless films are not picks.
	if got := ids(result.Sections[0]); !slices.Equal(got, []string{"both", "solo", "rated"}) {
		t.Fatalf("picks = %q", got)
	}
	actor := result.Sections[1]
	if actor.Kind != "actor" || actor.Name != "三上悠亞" || !slices.Equal(ids(actor), []string{"both", "solo", "up"}) {
		t.Fatalf("actor row = %+v", actor)
	}
	if result.Sections[2].Kind != "tag" || result.Sections[2].Title != "「巨乳」高分片" {
		t.Fatalf("tag row = %+v", result.Sections[2])
	}

	calls := fake.browse
	if _, err := service.Recommendations(t.Context(), false); err != nil || fake.browse != calls {
		t.Fatalf("a fresh result was rebuilt: %d calls, %v", fake.browse-calls, err)
	}
	service.now = func() time.Time { return time.Now().Add(ttl + time.Minute) }
	if _, err := service.Recommendations(t.Context(), false); err != nil || fake.browse == calls {
		t.Fatalf("a stale result was kept: %v", err)
	}
}

func TestRecommendationsFailWhenJavDBIsUnreachable(t *testing.T) {
	profile := fakeProfile{Movies: 1, Actors: []library.TasteItem{{ID: "a1", Name: "x", Count: 1, Weight: 1}}}
	if _, err := New(&fakeCatalogue{}, profile).Recommendations(t.Context(), false); err == nil {
		t.Fatal("no error when every page failed")
	}
	result, err := New(&fakeCatalogue{}, fakeProfile{}).Recommendations(t.Context(), false)
	if err != nil || len(result.Sections) != 0 {
		t.Fatalf("empty library = %+v, %v", result, err)
	}
}

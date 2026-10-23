package library

import (
	"testing"
	"time"

	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/ent"
)

func TestPlaybackListsPartsAndKeepsOneProgressPerMovie(t *testing.T) {
	lib, _, payload := libraryFixture(t)
	ctx := t.Context()
	film := lib.database.Movie.Create().SetCode("ABP-123").SaveX(ctx)
	for _, name := range []string{"ABP-123-cd2.mp4", "ABP-123-cd1.mp4"} {
		lib.database.File.Create().SetFileID(name).SetName(name).SetSize(1024).
			SetAccountID(payload.Source.AccountID).SetRootID(payload.Source.Directory.ID).SetMovieID(film.ID).SaveX(ctx)
	}
	info, err := lib.PlayInfo(ctx, film.ID)
	if err != nil || len(info.Files) != 2 || info.Files[0].Name != "ABP-123-cd1.mp4" || info.Progress != nil {
		t.Fatalf("PlayInfo() = %+v, %v", info, err)
	}
	for _, position := range []float64{30, 95} {
		if err := lib.SaveProgress(ctx, film.ID, Progress{FileID: "ABP-123-cd2.mp4", Position: position, Duration: 600}); err != nil {
			t.Fatal(err)
		}
	}
	items, err := lib.ContinueWatching(ctx)
	if err != nil || len(items) != 1 || items[0].Movie.ID != film.ID || items[0].Progress.Position != 95 {
		t.Fatalf("ContinueWatching() = %+v, %v", items, err)
	}
	if err := lib.ClearProgress(ctx, film.ID); err != nil {
		t.Fatal(err)
	}
	if items, err := lib.ContinueWatching(ctx); err != nil || len(items) != 0 {
		t.Fatalf("after clear = %+v, %v", items, err)
	}
}

func TestCollectionsFilterTheLibrary(t *testing.T) {
	lib, _, payload := libraryFixture(t)
	ctx := t.Context()
	var ids []int
	for _, code := range []string{"ABP-001", "ABP-002"} {
		film := lib.database.Movie.Create().SetCode(code).SaveX(ctx)
		lib.database.File.Create().SetFileID(code).SetName(code + ".mp4").SetSize(1024).
			SetAccountID(payload.Source.AccountID).SetRootID(payload.Source.Directory.ID).SetMovieID(film.ID).SaveX(ctx)
		ids = append(ids, film.ID)
	}
	favorites, err := lib.CreateCollection(ctx, " 收藏 ")
	if err != nil || favorites.Name != "收藏" {
		t.Fatalf("CreateCollection() = %+v, %v", favorites, err)
	}
	for range 2 {
		if err := lib.AddToCollection(ctx, favorites.ID, ids[1]); err != nil {
			t.Fatal(err)
		}
	}
	page, err := lib.SearchMovies(ctx, MovieFilter{Page: 1, Limit: 10, Collection: favorites.ID})
	if err != nil || page.Total != 1 || page.Movies[0].ID != ids[1] || page.Movies[0].FileCount != 1 {
		t.Fatalf("collection page = %+v, %v", page, err)
	}
	list, err := lib.Collections(ctx)
	if err != nil || len(list) != 1 || list[0].Count != 1 {
		t.Fatalf("Collections() = %+v, %v", list, err)
	}
	if err := lib.DeleteCollection(ctx, favorites.ID); err != nil {
		t.Fatal(err)
	}
	if held, err := lib.MovieCollections(ctx, ids[1]); err != nil || len(held) != 0 {
		t.Fatalf("after delete = %v, %v", held, err)
	}
}

func TestFacetsCountAndFilterByName(t *testing.T) {
	lib, _, payload := libraryFixture(t)
	ctx := t.Context()
	person := lib.database.Actor.Create().SetProvider("javdb").SetSourceID("a").SetName("演员").SetGender("female").SaveX(ctx)
	released := time.Date(2024, 5, 1, 0, 0, 0, 0, time.UTC)
	for i, code := range []string{"ABP-001", "ABP-002"} {
		create := lib.database.Movie.Create().SetCode(code).SetMakerName("厂牌")
		if i == 0 {
			create.AddActors(person).SetReleaseDate(released)
		}
		film := create.SaveX(ctx)
		for _, part := range []string{"-cd1", "-cd2"}[:i+1] {
			lib.database.File.Create().SetFileID(code + part).SetName(code + part + ".mp4").SetSize(1024).
				SetAccountID(payload.Source.AccountID).SetRootID(payload.Source.Directory.ID).SetMovieID(film.ID).SaveX(ctx)
		}
	}
	facets, err := lib.Facets(ctx)
	if err != nil || len(facets.Actors) != 1 || facets.Actors[0].Count != 1 || facets.Makers[0].Count != 2 ||
		len(facets.Years) != 1 || facets.Years[0].Name != "2024" {
		t.Fatalf("Facets() = %+v, %v", facets, err)
	}
	page, err := lib.SearchMovies(ctx, MovieFilter{Page: 1, Limit: 10, Actor: "演员", Maker: "厂牌", Year: 2024})
	if err != nil || page.Total != 1 || page.Movies[0].Code != "ABP-001" {
		t.Fatalf("filtered page = %+v, %v", page, err)
	}
	page, err = lib.SearchMovies(ctx, MovieFilter{Page: 1, Limit: 10, Maker: "厂牌", Sort: "code"})
	if err != nil || page.Total != 2 || page.Movies[1].FileCount != 2 {
		t.Fatalf("maker page = %+v, %v", page, err)
	}
}

func TestFacetsPairTranslatedActorsWithCatalogueNames(t *testing.T) {
	lib, _, payload := libraryFixture(t)
	ctx := t.Context()
	actress := func(name string) *ent.Actor {
		return lib.database.Actor.Create().SetProvider("nfo").SetSourceID(name).SetName(name).SaveX(ctx)
	}
	mikami, aoi := actress("三上悠亚"), actress("葵司")
	films := []struct {
		code      string
		cast      []*ent.Actor
		catalogue []domain.Actor
	}{
		// A solo film pairs 三上悠亚; the shared film then leaves 葵司 unpaired on each side.
		{"SSIS-001", []*ent.Actor{mikami}, []domain.Actor{{Name: "三上悠亞", Gender: "female", Avatar: "https://x/mikami.jpg"}}},
		{"SSIS-002", []*ent.Actor{mikami, aoi}, []domain.Actor{
			{Name: "男優", Gender: "male"}, {Name: "三上悠亞", Gender: "female"}, {Name: "葵つかさ", Gender: "female"},
		}},
	}
	for _, film := range films {
		movie := lib.database.Movie.Create().SetCode(film.code).AddActors(film.cast...).SaveX(ctx)
		lib.database.File.Create().SetFileID(film.code).SetName(film.code + ".mp4").SetSize(1024).
			SetAccountID(payload.Source.AccountID).SetRootID(payload.Source.Directory.ID).SetMovieID(movie.ID).SaveX(ctx)
		result := domain.MovieMetadata{Detail: domain.MovieDetail{Movie: domain.Movie{Code: film.code, Actors: film.catalogue}}}
		lib.database.MetadataCache.Create().SetProvider("javdb").SetCode(film.code).SetResult(&result).
			SetExpiresAt(time.Now().Add(time.Hour)).SaveX(ctx)
	}
	facets, err := lib.Facets(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]Facet{
		"三上悠亚": {Name: "三上悠亚", Count: 2, Alias: "三上悠亞", Avatar: "https://x/mikami.jpg"},
		"葵司":   {Name: "葵司", Count: 1, Alias: "葵つかさ"},
	}
	for _, facet := range facets.Actors {
		if facet != want[facet.Name] {
			t.Errorf("facet %+v, want %+v", facet, want[facet.Name])
		}
	}
}

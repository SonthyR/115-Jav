package library

import (
	"testing"

	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/nfo"
)

func TestTasteWeighsCollectedAndWatchedMovies(t *testing.T) {
	lib, _, payload := libraryFixture(t)
	ctx := t.Context()
	mikami := lib.database.Actor.Create().SetProvider("javdb").SetSourceID("mk1").SetName("三上悠亞").SaveX(ctx)
	aoi := lib.database.Actor.Create().SetProvider("javdb").SetSourceID("ao1").SetName("葵つかさ").SaveX(ctx)
	studio := nfo.Entity{Provider: "javdb", ID: "s1", Name: "S1"}
	common := nfo.Tag{Provider: "javdb", ID: "t0", Name: "單體作品"}
	films := []struct {
		code string
		cast *ent.Actor
		doc  nfo.Movie
	}{
		{"SSIS-001", mikami, nfo.Movie{Studio: studio, Tags: []nfo.Tag{common, {Provider: "javdb", ID: "t1", Name: "巨乳"}}}},
		{"SSIS-002", mikami, nfo.Movie{Studio: studio, Tags: []nfo.Tag{common}}},
		{"SSIS-003", aoi, nfo.Movie{Tags: []nfo.Tag{common, {Provider: "javdb", ID: "t2", Name: "美腳"}}}},
		{"SSIS-004", aoi, nfo.Movie{Set: nfo.Series{Provider: "javdb", ID: "x1", Name: "系列"}}},
	}
	ids := map[string]int{}
	for _, film := range films {
		movie := lib.database.Movie.Create().SetCode(film.code).AddActors(film.cast).SetMetadata(&film.doc).SaveX(ctx)
		ids[film.code] = movie.ID
		lib.database.File.Create().SetFileID(film.code).SetName(film.code + ".mp4").SetSize(1024).
			SetAccountID(payload.Source.AccountID).SetRootID(payload.Source.Directory.ID).SetMovieID(movie.ID).ExecX(ctx)
	}
	// 葵つかさ has two films, one collected and one watched, which outweighs
	// 三上悠亞's two untouched ones.
	collection := lib.database.Collection.Create().SetName("收藏").SaveX(ctx)
	lib.database.CollectionItem.Create().SetCollectionID(collection.ID).SetMovieID(ids["SSIS-003"]).ExecX(ctx)
	lib.database.PlaybackProgress.Create().SetMovieID(ids["SSIS-004"]).SetFileID("SSIS-004").
		SetPosition(0).SetDuration(0).SetPlayed(true).ExecX(ctx)

	taste, err := lib.Taste(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if taste.Movies != 4 || len(taste.Actors) != 2 || taste.Actors[0].ID != "ao1" || taste.Actors[0].Weight != 1 ||
		taste.Actors[1].Count != 2 || taste.Actors[1].Weight != 2/5.5 {
		t.Fatalf("actors = %+v", taste)
	}
	// 單體作品 is on most films and says nothing.
	if len(taste.Tags) != 2 || taste.Tags[0].ID != "t2" || taste.Tags[1].ID != "t1" {
		t.Fatalf("tags = %+v", taste.Tags)
	}
	if len(taste.Makers) != 1 || taste.Makers[0].Count != 2 || len(taste.Series) != 1 || taste.Series[0].Name != "系列" {
		t.Fatalf("makers = %+v, series = %+v", taste.Makers, taste.Series)
	}
}

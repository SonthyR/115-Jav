package library

import "testing"

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

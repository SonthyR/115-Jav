package library

import "testing"

func TestFacetsAreKeptUntilTheLibraryChanges(t *testing.T) {
	lib, _, payload := libraryFixture(t)
	ctx := t.Context()
	add := func(code, maker string) {
		film := lib.database.Movie.Create().SetCode(code).SetMakerName(maker).SaveX(ctx)
		lib.database.File.Create().SetFileID(code).SetName(code + ".mp4").SetSize(1024).
			SetAccountID(payload.Source.AccountID).SetRootID(payload.Source.Directory.ID).SetMovieID(film.ID).SaveX(ctx)
	}
	add("ABP-001", "Prestige")
	if facets, err := lib.Facets(ctx); err != nil || len(facets.Makers) != 1 {
		t.Fatalf("Facets() = %+v, %v", facets.Makers, err)
	}
	add("SONE-001", "S1")
	if facets, _ := lib.Facets(ctx); len(facets.Makers) != 1 {
		t.Fatalf("recounted without a library change: %+v", facets.Makers)
	}
	lib.tasks.NotifyLibraryChanged()
	if facets, _ := lib.Facets(ctx); len(facets.Makers) != 2 {
		t.Fatalf("kept stale facets: %+v", facets.Makers)
	}
}

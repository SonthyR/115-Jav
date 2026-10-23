package actoralias

import (
	"slices"
	"testing"
	"time"

	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/domain"
)

func TestTranslationsFollowFilmsSharedWithTheCatalogue(t *testing.T) {
	store, err := database.Open(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	ctx, db := t.Context(), store.Client
	for _, code := range []string{"SSIS-001", "SSIS-002", "SSIS-003"} {
		person := db.Actor.Create().SetProvider("nfo").SetSourceID(code).SetName("森泽佳奈").SaveX(ctx)
		db.Movie.Create().SetCode(code).AddActors(person).SaveX(ctx)
		catalogue := "森沢かな"
		if code == "SSIS-002" {
			catalogue = "別人" // one mislabelled film is outvoted
		}
		result := domain.MovieMetadata{Detail: domain.MovieDetail{Movie: domain.Movie{
			Code: code, Actors: []domain.Actor{{Name: catalogue, Gender: "female"}},
		}}}
		db.MetadataCache.Create().SetProvider("javdb").SetCode(code).SetResult(&result).
			SetExpiresAt(time.Now().Add(time.Hour)).SaveX(ctx)
	}
	db.Movie.Create().SetCode("SSIS-004").SaveX(ctx)
	index := New(db)
	if got := index.Translations(ctx, "森沢かな"); !slices.Equal(got, []string{"森泽佳奈"}) {
		t.Fatalf("Translations = %q, aliases %+v", got, index.Aliases(ctx))
	}
	var none *Index
	if none.Translations(ctx, "森沢かな") != nil {
		t.Fatal("a nil index found translations")
	}
}

package actoralias

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/ent/actor"
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

func TestSharedFilmsPairByCommonNamesAndKanji(t *testing.T) {
	store, err := database.Open(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	ctx, db := t.Context(), store.Client
	films := []struct {
		code      string
		cast      []string
		catalogue []string
	}{
		// Neither film has one name on each side; the name both credit is
		// 深田えいみ, and each partner is then the one name left.
		{"ABP-001", []string{"深田咏美", "天海翼"}, []string{"深田えいみ", "天海つばさ"}},
		{"ABP-002", []string{"深田咏美", "河北彩花"}, []string{"深田えいみ", "河北彩伽"}},
		// More library names than catalogue ones: only kanji can tell.
		{"ABP-003", []string{"藤森里穗", "小野夕子"}, []string{"藤森里穂"}},
	}
	for _, film := range films {
		movie := db.Movie.Create().SetCode(film.code)
		for _, name := range film.cast {
			person, err := db.Actor.Query().Where(actor.NameEQ(name)).Only(ctx)
			if err != nil {
				person = db.Actor.Create().SetProvider("nfo").SetSourceID(name).SetName(name).SaveX(ctx)
			}
			movie.AddActors(person)
		}
		movie.SaveX(ctx)
		result := domain.MovieMetadata{Detail: domain.MovieDetail{Movie: domain.Movie{Code: film.code}}}
		for _, name := range film.catalogue {
			result.Detail.Actors = append(result.Detail.Actors, domain.Actor{Name: name, Gender: "female"})
		}
		db.MetadataCache.Create().SetProvider("javdb").SetCode(film.code).SetResult(&result).
			SetExpiresAt(time.Now().Add(time.Hour)).SaveX(ctx)
	}
	aliases := New(db).Aliases(ctx)
	want := map[string]string{"深田咏美": "深田えいみ", "天海翼": "天海つばさ", "河北彩花": "河北彩伽", "藤森里穗": "藤森里穂"}
	for name, catalogue := range want {
		if aliases[name].Name != catalogue {
			t.Errorf("%s paired with %q, want %q", name, aliases[name].Name, catalogue)
		}
	}
	if alias, ok := aliases["小野夕子"]; ok {
		t.Errorf("小野夕子 paired with %q", alias.Name)
	}
}

func TestLinkerLooksUpFilmsOfUnpairedActresses(t *testing.T) {
	store, err := database.Open(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	ctx, db := t.Context(), store.Client
	translated := db.Actor.Create().SetProvider("nfo").SetSourceID("三上悠亚").SetName("三上悠亚").SaveX(ctx)
	scraped := db.Actor.Create().SetProvider("javdb").SetSourceID("mk1").SetName("三上悠亞").SaveX(ctx)
	db.Movie.Create().SetCode("SSIS-001").AddActors(translated).SaveX(ctx)
	db.Movie.Create().SetCode("SSIS-002").AddActors(scraped).SaveX(ctx)
	var fetched []string
	linker := NewLinker(New(db), func(ctx context.Context, code string) error {
		fetched = append(fetched, code)
		result := domain.MovieMetadata{Detail: domain.MovieDetail{Movie: domain.Movie{
			Code: code, Actors: []domain.Actor{{Name: "三上悠亞", Gender: "female", ID: "mk1"}},
		}}}
		return db.MetadataCache.Create().SetProvider("javdb").SetCode(code).SetResult(&result).
			SetExpiresAt(time.Now().Add(time.Hour)).Exec(ctx)
	})
	linker.pause = 0
	status, err := linker.Start(ctx)
	if err != nil || status.Total != 1 || status.Unresolved != 1 {
		t.Fatalf("Start = %+v, %v", status, err)
	}
	for deadline := time.Now().Add(5 * time.Second); status.Running; {
		if time.Now().After(deadline) {
			t.Fatal("linking did not finish")
		}
		time.Sleep(10 * time.Millisecond)
		status, err = linker.Status(ctx)
		if err != nil {
			t.Fatal(err)
		}
	}
	if !slices.Equal(fetched, []string{"SSIS-001"}) || status.Done != 1 || status.Unresolved != 0 {
		t.Fatalf("fetched %q, status %+v", fetched, status)
	}
	people := New(db).People(ctx)
	if people.Name("三上悠亚") != "三上悠亞" || !slices.Equal(people.Names("三上悠亞"), []string{"三上悠亚", "三上悠亞"}) {
		t.Fatalf("people = %+v", people)
	}
	if status, err := linker.Start(ctx); err != nil || status.Running || status.Total != 0 {
		t.Fatalf("second Start = %+v, %v", status, err)
	}
}

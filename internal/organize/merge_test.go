package organize

import (
	"context"
	"slices"
	"strings"
	"testing"

	"github.com/ppxb/miyabi/internal/actorname"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/actor"
	"github.com/ppxb/miyabi/internal/ent/file"
	"github.com/ppxb/miyabi/internal/ent/movie"
	"github.com/ppxb/miyabi/internal/nfo"
	"github.com/ppxb/miyabi/internal/pan"
)

type person struct {
	provider, id, name, zht string
}

// indexMovie puts lib/<folder>/<code>/<video> on 115 and in the index, with
// an NFO next to the video when the movie has metadata.
func (h *harness) indexMovie(t *testing.T, folder, code, video string, people ...person) *ent.Movie {
	t.Helper()
	ctx, db := t.Context(), h.service.db
	actorDir := ""
	for _, entry := range h.files.mustEntries(t, "lib") {
		if entry.Name == folder {
			actorDir = entry.ID
		}
	}
	if actorDir == "" {
		actorDir = h.files.dir("lib", folder)
	}
	codeDir := h.files.dir(actorDir, code)
	videoID := h.files.add(codeDir, video, 2*gb)
	h.files.add(codeDir, strings.TrimSuffix(video, ".mp4")+".nfo", 100)

	doc := nfo.Movie{Code: code, Title: code}
	var ids []int
	for _, p := range people {
		doc.Actors = append(doc.Actors, nfo.Actor{Provider: p.provider, ID: p.id, Name: p.name, NameZHT: p.zht})
		create := db.Actor.Create().SetProvider(p.provider).SetSourceID(p.id).SetName(p.name).SetGender(actor.GenderFemale)
		if p.zht != "" {
			create.SetNameZht(p.zht)
		}
		id, err := create.OnConflictColumns(actor.FieldProvider, actor.FieldSourceID).UpdateNewValues().ID(ctx)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	record, err := db.Movie.Query().Where(movie.CodeEQ(code)).Only(ctx)
	if ent.IsNotFound(err) {
		record, err = db.Movie.Create().SetCode(code).SetMetadata(&doc).AddActorIDs(ids...).Save(ctx)
	}
	if err != nil {
		t.Fatal(err)
	}
	db.File.Create().SetFileID(videoID).SetName(video).SetSize(2 * gb).SetParentID(codeDir).
		SetAccountID("1").SetRootID("lib").SetPath("/After/" + folder + "/" + code + "/" + video).
		SetMovieID(record.ID).ExecX(ctx)
	return record
}

func (f *fakeFiles) mustEntries(t *testing.T, id string) []pan.File {
	t.Helper()
	entries, err := f.Entries(t.Context(), id)
	if err != nil {
		t.Fatal(err)
	}
	return entries
}

func TestFindAndMergeActorFolders(t *testing.T) {
	t.Cleanup(func() { actorname.Set(nil) })
	h := newHarness(t, fakeResolver{"PRED-800": {{Name: "三上悠亜", NameZHT: "三上悠亞"}}}, nil)
	mikami := person{"javdb", "m1", "三上悠亜", "三上悠亞"}
	h.indexMovie(t, "三上悠亚", "SSIS-001", "SSIS-001.mp4", person{"nfo", "SSIS-001:0", "三上悠亚", ""})
	h.indexMovie(t, "三上悠亚", "SSIS-003", "SSIS-003.mp4", mikami)
	h.indexMovie(t, "三上悠亜", "SSIS-002", "SSIS-002-C.mp4", mikami)
	h.indexMovie(t, "三上悠亜", "SSIS-001", "SSIS-001-C.mp4", mikami) // same code folder in both
	karen := person{"javdb", "k1", "楓カレン", "楓花戀"}
	h.indexMovie(t, "楓カレン", "ABP-001", "ABP-001.mp4", karen)
	h.indexMovie(t, "枫花恋", "ABP-002", "ABP-002.mp4", person{"nfo", "ABP-002:0", "枫花恋", ""})
	h.indexMovie(t, "河北彩花", "MIDE-001", "MIDE-001.mp4", person{"javdb", "s1", "河北彩花", ""})
	h.files.dir("lib", ManyActors)

	found, err := h.service.FindActorFolders(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	var groups []string
	for _, group := range found.Groups {
		var names []string
		for _, folder := range group.Folders {
			names = append(names, folder.Name)
		}
		groups = append(groups, group.Suggested+"/"+group.Catalogue+"="+strings.Join(names, "|"))
	}
	want := []string{"三上悠亚/三上悠亜=三上悠亚|三上悠亜", "枫花恋/楓カレン=枫花恋|楓カレン"}
	if !slices.Equal(groups, want) {
		t.Fatalf("groups = %v, want %v", groups, want)
	}
	if len(found.Folders) != 5 {
		t.Fatalf("folders = %+v", found.Folders)
	}

	synced := 0
	h.service.SetSync(func(context.Context) error { synced++; return nil })
	err = h.service.mergeActors(t.Context(), []ActorMerge{
		{Target: "三上悠亚", Sources: []string{"三上悠亜"}},
		{Target: "楓カレン", Sources: []string{"枫花恋"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	wantTree := []string{
		"三上悠亚/SSIS-001/SSIS-001.mp4", "三上悠亚/SSIS-001/SSIS-001.nfo",
		"三上悠亚/SSIS-002/SSIS-002-C.mp4", "三上悠亚/SSIS-002/SSIS-002-C.nfo",
		"三上悠亚/SSIS-003/SSIS-003.mp4", "三上悠亚/SSIS-003/SSIS-003.nfo",
		"三上悠亜/SSIS-001/SSIS-001-C.mp4", "三上悠亜/SSIS-001/SSIS-001-C.nfo",
		"楓カレン/ABP-001/ABP-001.mp4", "楓カレン/ABP-001/ABP-001.nfo",
		"楓カレン/ABP-002/ABP-002.mp4", "楓カレン/ABP-002/ABP-002.nfo",
		"河北彩花/MIDE-001/MIDE-001.mp4", "河北彩花/MIDE-001/MIDE-001.nfo",
	}
	if got := h.files.paths("lib"); !slices.Equal(got, wantTree) {
		t.Fatalf("library = %v\nwant %v", got, wantTree)
	}
	if !slices.Contains(h.files.deleted, "枫花恋") || slices.Contains(h.files.deleted, "三上悠亜") {
		t.Fatalf("deleted %v; the folder with a clash must stay", h.files.deleted)
	}
	moved := h.service.db.File.Query().Where(file.NameEQ("SSIS-002-C.mp4")).OnlyX(t.Context())
	if moved.Path != "/After/三上悠亚/SSIS-002/SSIS-002-C.mp4" {
		t.Fatalf("index path = %q", moved.Path)
	}

	aliases := actorname.Current()
	for name, kept := range map[string]string{"三上悠亜": "三上悠亚", "三上悠亞": "三上悠亚", "枫花恋": "楓カレン", "楓花戀": "楓カレン", "河北彩花": "河北彩花"} {
		if got := aliases.Canonical(name); got != kept {
			t.Errorf("Canonical(%s) = %s, want %s", name, got, kept)
		}
	}
	// NFOs on 115 that named another spelling are replaced in place.
	var rewritten []string
	for id, body := range h.files.bodies {
		file := h.files.files[id]
		doc, err := nfo.Decode(body)
		if err != nil {
			t.Fatal(err)
		}
		rewritten = append(rewritten, file.Name+":"+doc.Actors[0].Name)
	}
	slices.Sort(rewritten)
	wantNFO := []string{"ABP-002.nfo:楓カレン", "SSIS-002-C.nfo:三上悠亚", "SSIS-003.nfo:三上悠亚"}
	if !slices.Equal(rewritten, wantNFO) {
		t.Fatalf("rewritten NFOs = %v, want %v", rewritten, wantNFO)
	}
	if synced != 1 {
		t.Fatalf("synced %d times", synced)
	}

	// A new movie for a merged actor goes to the kept folder.
	release := h.files.dir(h.inbox, "PRED-800")
	h.files.add(release, "PRED-800.mp4", 2*gb)
	h.poll(t)
	if got := h.files.paths("lib"); !slices.Contains(got, "三上悠亚/PRED-800/PRED-800.mp4") {
		t.Fatalf("new movie went to %v", got)
	}
}

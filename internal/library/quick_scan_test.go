package library

import (
	"context"
	"slices"
	"sync"
	"testing"

	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/ent/file"
	"github.com/ppxb/miyabi/internal/ent/task"
	"github.com/ppxb/miyabi/internal/pan"
	"github.com/ppxb/miyabi/internal/tasks"
)

func TestQuickScanListsOnlyFoldersWithChangedVideos(t *testing.T) {
	lib, client := panConcurrencyFixture(t)
	ctx, source := t.Context(), *lib.drive.Source()
	root := source.Directory.ID
	video := func(id, parent, name string) pan.File {
		return pan.File{ID: id, ParentID: parent, Name: name, Size: domain.MinVideoSize, PickCode: "pc" + id}
	}
	tree := map[string][]pan.File{
		root: {{ID: "a", ParentID: root, Name: "A", IsDirectory: true}, {ID: "b", ParentID: root, Name: "B", IsDirectory: true}},
		"a":  {video("va", "a", "ABP-001.mp4")},
		"b":  {video("vb", "b", "SSIS-001.mp4")},
	}
	var mu sync.Mutex
	var listed []string
	client.list = func(_ context.Context, _, id string, _, _ int) (pan.FilePage, error) {
		mu.Lock()
		listed = append(listed, id)
		mu.Unlock()
		entries := tree[id]
		return pan.FilePage{Files: entries, Total: len(entries), Path: []pan.Directory{{ID: root}}}, nil
	}
	runScan := func() {
		t.Helper()
		job := lib.database.Task.Query().Where(task.TypeEQ("scan"), task.StatusNEQ(task.StatusDone)).
			Order(task.ByID()).FirstX(ctx)
		if err := lib.Scan(ctx, tasks.Job{ID: job.ID, Payload: job.Payload}); err != nil {
			t.Fatal(err)
		}
		lib.database.Task.UpdateOneID(job.ID).SetStatus(task.StatusDone).ExecX(ctx)
	}
	runScan()

	// SSIS-001 was deleted and ABP-002 arrived in a new folder.
	tree[root] = []pan.File{{ID: "a", ParentID: root, Name: "A", IsDirectory: true}, {ID: "c", ParentID: root, Name: "C", IsDirectory: true}}
	tree["c"] = []pan.File{video("vc", "c", "ABP-002.mp4")}
	delete(tree, "b")
	client.listVideos = func(_ context.Context, _, id string, offset, _ int) (pan.FilePage, error) {
		if id != root || offset != 0 {
			t.Errorf("ListVideos(%s, %d)", id, offset)
		}
		files := []pan.File{video("vc", "c", "ABP-002.mp4"), video("va", "a", "ABP-001.mp4")}
		return pan.FilePage{Files: files, Total: len(files)}, nil
	}
	client.info = func(_ context.Context, _, id string) (pan.FileInfo, error) {
		if id != "c" {
			return pan.FileInfo{}, pan.ErrNotFound
		}
		return pan.FileInfo{File: pan.File{ID: id, Name: "C", IsDirectory: true},
			Path: []pan.Directory{{ID: "0"}, {ID: root, Name: "Movies"}}}, nil
	}
	if _, err := lib.StartScan(ctx); err != nil {
		t.Fatal(err)
	}
	listed = nil
	runScan()

	if !slices.Equal(listed, []string{"c"}) {
		t.Fatalf("quick scan listed %v, want only the changed folders", listed)
	}
	names := lib.database.File.Query().Order(file.ByFileID()).Select(file.FieldPath).StringsX(ctx)
	if !slices.Equal(names, []string{"/Movies/A/ABP-001.mp4", "/Movies/C/ABP-002.mp4"}) {
		t.Fatalf("indexed files = %v", names)
	}
}

func TestQuickScanKeepsVideosTheListingMissed(t *testing.T) {
	lib, client := panConcurrencyFixture(t)
	ctx, source := t.Context(), *lib.drive.Source()
	root := source.Directory.ID
	va := pan.File{ID: "va", ParentID: "a", Name: "ABP-001.mp4", Size: domain.MinVideoSize, PickCode: "pa"}
	vb := pan.File{ID: "vb", ParentID: "a", Name: "ABP-001.wmv", Size: domain.MinVideoSize, PickCode: "pb"}
	tree := map[string][]pan.File{root: {{ID: "a", ParentID: root, Name: "A", IsDirectory: true}}, "a": {va, vb}}
	client.list = func(_ context.Context, _, id string, _, _ int) (pan.FilePage, error) {
		return pan.FilePage{Files: tree[id], Total: len(tree[id]), Path: []pan.Directory{{ID: root}}}, nil
	}
	client.info = func(_ context.Context, _, id string) (pan.FileInfo, error) {
		return pan.FileInfo{File: pan.File{ID: id, Name: "A", IsDirectory: true},
			Path: []pan.Directory{{ID: "0"}, {ID: root, Name: "Movies"}}}, nil
	}
	for round := range 2 {
		if round == 1 {
			// 115 does not count one of the files as a video.
			client.listVideos = func(context.Context, string, string, int, int) (pan.FilePage, error) {
				return pan.FilePage{Files: []pan.File{va}, Total: 1}, nil
			}
			if _, err := lib.StartScan(ctx); err != nil {
				t.Fatal(err)
			}
		}
		job := lib.database.Task.Query().Where(task.TypeEQ("scan"), task.StatusNEQ(task.StatusDone)).
			Order(task.ByID()).FirstX(ctx)
		if err := lib.Scan(ctx, tasks.Job{ID: job.ID, Payload: job.Payload}); err != nil {
			t.Fatal(err)
		}
		lib.database.Task.UpdateOneID(job.ID).SetStatus(task.StatusDone).ExecX(ctx)
		if count := lib.database.File.Query().CountX(ctx); count != 2 {
			t.Fatalf("round %d indexed %d files", round, count)
		}
	}
}

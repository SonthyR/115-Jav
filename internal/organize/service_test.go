package organize

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/pan"
)

const gb = int64(1) << 30

// fakeFiles is an in-memory 115 tree. The library root is "lib".
type fakeFiles struct {
	files   map[string]pan.File
	parent  map[string]string
	next    int
	deleted []string
	bodies  map[string][]byte
	// listFailures makes the next listings of a directory fail.
	listFailures map[string]int
}

func newFakeFiles() *fakeFiles {
	return &fakeFiles{files: map[string]pan.File{}, parent: map[string]string{}}
}

func (f *fakeFiles) add(parentID, name string, size int64) string {
	f.next++
	id := fmt.Sprintf("f%d", f.next)
	f.files[id] = pan.File{ID: id, Name: name, Size: size, IsDirectory: size < 0}
	f.parent[id] = parentID
	return id
}

func (f *fakeFiles) dir(parentID, name string) string { return f.add(parentID, name, -1) }

// paths lists every file under id as slash-separated names, sorted.
func (f *fakeFiles) paths(id string) []string {
	var out []string
	for child, parent := range f.parent {
		if parent != id {
			continue
		}
		file := f.files[child]
		if file.IsDirectory {
			for _, sub := range f.paths(child) {
				out = append(out, file.Name+"/"+sub)
			}
			continue
		}
		out = append(out, file.Name)
	}
	slices.Sort(out)
	return out
}

func (f *fakeFiles) Source() domain.LibrarySource {
	return domain.LibrarySource{AccountID: "1", Directory: domain.LibraryDirectory{ID: "lib", Name: "After", Path: "/After"}}
}

func (f *fakeFiles) Entries(_ context.Context, dirID string) ([]pan.File, error) {
	if f.listFailures[dirID] > 0 {
		f.listFailures[dirID]--
		return nil, errors.New("directory changed while listing")
	}
	var out []pan.File
	for id, parent := range f.parent {
		if parent == dirID {
			out = append(out, f.files[id])
		}
	}
	slices.SortFunc(out, func(a, b pan.File) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}

func (f *fakeFiles) Mkdir(_ context.Context, parentID, name string) (string, error) {
	return f.dir(parentID, name), nil
}

func (f *fakeFiles) Move(_ context.Context, ids []string, targetID string) error {
	for _, id := range ids {
		f.parent[id] = targetID
	}
	return nil
}

func (f *fakeFiles) Rename(_ context.Context, id, name string) error {
	file := f.files[id]
	file.Name = name
	f.files[id] = file
	return nil
}

func (f *fakeFiles) Delete(_ context.Context, ids []string, _ string) error {
	for _, id := range ids {
		delete(f.parent, id)
		f.deleted = append(f.deleted, f.files[id].Name)
	}
	return nil
}

func (f *fakeFiles) Upload(_ context.Context, parentID, name string, body []byte) (pan.UploadedFile, error) {
	id := f.add(parentID, name, int64(len(body)))
	if f.bodies == nil {
		f.bodies = make(map[string][]byte)
	}
	f.bodies[id] = body
	return pan.UploadedFile{}, nil
}

type fakeResolver map[string][]domain.Actor

func (r fakeResolver) Resolve(_ context.Context, ref domain.MovieRef) (domain.MovieMetadata, error) {
	actors, ok := r[ref.Code]
	if !ok {
		return domain.MovieMetadata{}, fmt.Errorf("not found")
	}
	var metadata domain.MovieMetadata
	metadata.Detail.Actors = actors
	return metadata, nil
}

type fakeScanner struct{ targets []string }

func (s *fakeScanner) EnqueueTargetedScan(_ context.Context, _ *ent.Tx, _ domain.LibrarySource, targetID string, _ int, code, _ string) (int, error) {
	s.targets = append(s.targets, targetID+":"+code)
	return 1, nil
}

type harness struct {
	service *Service
	files   *fakeFiles
	scanner *fakeScanner
	woken   int
	inbox   string
	failed  string
}

func newHarness(t *testing.T, resolver fakeResolver, configure func(*Rule)) *harness {
	t.Helper()
	store, err := database.Open(t.Context(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	h := &harness{files: newFakeFiles(), scanner: &fakeScanner{}}
	h.inbox = h.files.dir("root", "Before")
	h.failed = h.files.dir("root", "Failed")
	h.service = &Service{
		db: store.Client, metadata: resolver, scanner: h.scanner, wake: func() { h.woken++ },
		open:  func(context.Context) (Files, error) { return h.files, nil },
		sizes: map[string]string{}, failed: map[string]string{},
	}
	rule := Rule{Enabled: true, Source: Folder{ID: h.inbox, Path: "/Before"}, Failed: Folder{ID: h.failed, Path: "/Failed"}}
	if configure != nil {
		configure(&rule)
	}
	if _, err := h.service.UpdateConfig(t.Context(), Config{Rules: []Rule{rule}, CleanJunk: true}); err != nil {
		t.Fatal(err)
	}
	return h
}

// poll runs twice, as a release is organized only once its sizes are stable.
func (h *harness) poll(t *testing.T) {
	t.Helper()
	for range 2 {
		if err := h.service.Run(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
}

func (h *harness) log(t *testing.T) []Entry {
	t.Helper()
	entries, err := h.service.Log(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	return entries
}

func TestRunOrganizesAReleaseIntoActorAndCodeFolders(t *testing.T) {
	h := newHarness(t, fakeResolver{"PRED-709": {{Name: "三上悠亜"}, {Name: "男優", Gender: "male"}}}, nil)
	release := h.files.dir(h.inbox, "pred-709-C 中文字幕")
	h.files.add(release, "pred-709ch.mp4", 2*gb)
	h.files.add(release, "pred-709ch.chs.srt", 10)
	h.files.add(release, "广告.mp4", 10<<20)
	h.files.add(release, "最新地址.url", 1)
	h.files.dir("lib", "三上悠亚")

	if err := h.service.Run(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := h.files.paths(h.inbox); len(got) != 4 {
		t.Fatalf("organized before the sizes were stable: %v", got)
	}
	h.poll(t)

	want := []string{"三上悠亚/PRED-709/PRED-709-C.chs.srt", "三上悠亚/PRED-709/PRED-709-C.mp4"}
	if got := h.files.paths("lib"); !slices.Equal(got, want) {
		t.Fatalf("library = %v, want %v; log %+v", got, want, h.log(t))
	}
	if got := h.files.paths(h.inbox); len(got) != 0 {
		t.Fatalf("inbox still has %v", got)
	}
	if !slices.Equal(h.files.deleted, []string{"pred-709-C 中文字幕"}) {
		t.Fatalf("recycled %v", h.files.deleted)
	}
	if len(h.scanner.targets) != 1 || !strings.HasSuffix(h.scanner.targets[0], ":PRED-709") || h.woken != 1 {
		t.Fatalf("scan = %v, woken %d", h.scanner.targets, h.woken)
	}
	if entries := h.log(t); len(entries) != 1 || entries[0].Status != "done" {
		t.Fatalf("log = %+v", entries)
	}
}

func TestRunNamesMultiPartReleasesAndGroupsManyActors(t *testing.T) {
	actors := []domain.Actor{{Name: "A"}, {Name: "B"}, {Name: "C"}, {Name: "D"}}
	h := newHarness(t, fakeResolver{"ABP-123": actors}, nil)
	release := h.files.dir(h.inbox, "ABP-123")
	h.files.add(release, "ABP-123-B.mkv", gb)
	h.files.add(release, "ABP-123-A.mkv", gb)
	h.poll(t)
	want := []string{"多人作品/ABP-123/ABP-123-cd1.mkv", "多人作品/ABP-123/ABP-123-cd2.mkv"}
	if got := h.files.paths("lib"); !slices.Equal(got, want) {
		t.Fatalf("library = %v, want %v; log %+v", got, want, h.log(t))
	}
}

func TestRunMovesUnidentifiedReleasesToTheFailedFolderOnce(t *testing.T) {
	h := newHarness(t, fakeResolver{}, nil)
	release := h.files.dir(h.inbox, "holiday")
	h.files.add(release, "holiday.mp4", gb)
	missing := h.files.dir(h.inbox, "SSIS-001")
	h.files.add(missing, "SSIS-001.mp4", gb)
	h.poll(t)
	h.poll(t)
	if got := h.files.paths(h.failed); !slices.Equal(got, []string{"SSIS-001/SSIS-001.mp4", "holiday/holiday.mp4"}) {
		t.Fatalf("failed folder = %v", got)
	}
	entries := h.log(t)
	if len(entries) != 2 || entries[0].Status != "failed" || entries[1].Status != "failed" {
		t.Fatalf("log = %+v", entries)
	}
}

func TestRunDryRunOnlyLogsThePlan(t *testing.T) {
	h := newHarness(t, fakeResolver{"SSIS-001": {{Name: "X"}}}, func(rule *Rule) { rule.DryRun = true })
	release := h.files.dir(h.inbox, "SSIS-001")
	h.files.add(release, "SSIS-001.mp4", gb)
	bad := h.files.dir(h.inbox, "unknown")
	h.files.add(bad, "unknown.mp4", gb)
	h.poll(t)
	h.poll(t)
	if got := h.files.paths("lib"); len(got) != 0 {
		t.Fatalf("dry run changed the library: %v", got)
	}
	if got := h.files.paths(h.inbox); len(got) != 2 {
		t.Fatalf("dry run moved files: %v", got)
	}
	entries := h.log(t)
	if len(entries) != 2 {
		t.Fatalf("log = %+v", entries)
	}
	for _, entry := range entries {
		if entry.Code == "SSIS-001" && (entry.Status != "dry_run" || entry.Target != "X/SSIS-001/ SSIS-001.mp4") {
			t.Fatalf("plan = %+v", entry)
		}
	}
}

func TestRunKeepsDuplicatesWhenTheLibraryAlreadyHasTheCode(t *testing.T) {
	h := newHarness(t, fakeResolver{"SSIS-001": {{Name: "X"}}}, nil)
	code := h.files.dir(h.files.dir("lib", "X"), "SSIS-001")
	h.files.add(code, "SSIS-001.mp4", gb)
	release := h.files.dir(h.inbox, "SSIS-001")
	h.files.add(release, "SSIS-001.mp4", gb)
	h.poll(t)
	if got := h.files.paths(h.failed); !slices.Equal(got, []string{"SSIS-001/SSIS-001.mp4"}) {
		t.Fatalf("duplicate was not set aside: %v", got)
	}
	if len(h.files.deleted) != 0 || len(h.scanner.targets) != 0 {
		t.Fatalf("deleted %v, scanned %v", h.files.deleted, h.scanner.targets)
	}
}

func TestRunIgnoresUnderscoreFoldersAndSmallVideos(t *testing.T) {
	h := newHarness(t, fakeResolver{"SSIS-001": {{Name: "X"}}}, nil)
	helper := h.files.dir(h.inbox, "_失败")
	h.files.add(helper, "SSIS-001.mp4", gb)
	sample := h.files.dir(h.inbox, "SSIS-001")
	h.files.add(sample, "SSIS-001.mp4", 50<<20)
	h.poll(t)
	if got := h.files.paths("lib"); len(got) != 0 {
		t.Fatalf("library = %v", got)
	}
	if entries := h.log(t); len(entries) != 0 {
		t.Fatalf("log = %+v", entries)
	}
}

func TestUpdateConfigRejectsMissingSource(t *testing.T) {
	h := newHarness(t, fakeResolver{}, nil)
	if _, err := h.service.UpdateConfig(t.Context(), Config{Rules: []Rule{{Enabled: true}}}); err == nil {
		t.Fatal("accepted a rule without a source")
	}
	cfg, err := h.service.UpdateConfig(t.Context(), Config{Rules: []Rule{{Source: Folder{ID: "1"}, Failed: Folder{ID: "2"}}}})
	if err != nil || cfg.MaxActors != DefaultMaxActors || cfg.MinVideoMB != 200 {
		t.Fatalf("cfg = %+v, %v", cfg, err)
	}
}

func TestReleaseCode(t *testing.T) {
	for _, tc := range []struct {
		codes       []string
		code, other string
	}{
		{[]string{"PRED-709CH"}, "PRED-709", ""},
		{[]string{"ABP-123-A", "ABP-123-B"}, "ABP-123", ""},
		{[]string{"ABP-123-B"}, "ABP-123-B", ""},
		{[]string{"ABP-123", "SSIS-001"}, "ABP-123", "SSIS-001"},
		{[]string{"259LUXU-1899", "LUXU-1899"}, "259LUXU-1899", ""},
	} {
		if code, other := releaseCode(tc.codes); code != tc.code || other != tc.other {
			t.Errorf("releaseCode(%v) = %s, %s", tc.codes, code, other)
		}
	}
}

func TestPlaceOrganizesAFinishedDownload(t *testing.T) {
	h := newHarness(t, fakeResolver{"SSIS-001": {{Name: "X"}}}, nil)
	download := h.files.dir("lib", "[site.com]SSIS-001")
	h.files.add(download, "SSIS-001-C.mp4", gb)
	h.files.add(download, "readme.txt", 1)
	codeID, err := h.service.Place(t.Context(), download, "SSIS-001")
	if err != nil {
		t.Fatal(err)
	}
	if got := h.files.paths("lib"); !slices.Equal(got, []string{"X/SSIS-001/SSIS-001-C.mp4"}) {
		t.Fatalf("library = %v", got)
	}
	if h.files.files[codeID].Name != "SSIS-001" || len(h.scanner.targets) != 0 {
		t.Fatalf("code folder %q, scans %v", h.files.files[codeID].Name, h.scanner.targets)
	}
	if _, err := h.service.Place(t.Context(), download, "SSIS-001"); !errors.Is(err, ErrNotPlaced) {
		t.Fatalf("placed a recycled download again: %v", err)
	}
}

func TestPlaceLeavesDownloadsWhenNoRuleIsEnabled(t *testing.T) {
	h := newHarness(t, fakeResolver{"SSIS-001": {{Name: "X"}}}, func(rule *Rule) { rule.Enabled = false })
	download := h.files.dir("lib", "SSIS-001")
	h.files.add(download, "SSIS-001.mp4", gb)
	if _, err := h.service.Place(t.Context(), download, "SSIS-001"); !errors.Is(err, ErrNotPlaced) {
		t.Fatalf("err = %v", err)
	}
	if got := h.files.paths("lib"); !slices.Equal(got, []string{"SSIS-001/SSIS-001.mp4"}) {
		t.Fatalf("library = %v", got)
	}
}

func TestPollSummarizesWhatItSaw(t *testing.T) {
	h := newHarness(t, fakeResolver{"SSIS-001": {{Name: "X"}}}, func(rule *Rule) { rule.DryRun = true })
	h.files.add(h.files.dir(h.inbox, "SSIS-001"), "SSIS-001.mp4", gb)
	h.files.add(h.files.dir(h.inbox, "sample"), "sample.mp4", 10<<20)
	h.files.dir(h.inbox, "_skip")
	var last *summary
	for range 2 {
		var err error
		if last, err = h.service.poll(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	if *last != (summary{entries: 3, skipped: 1, noVideo: 1, handled: 1}) {
		t.Fatalf("summary = %+v", *last)
	}
}

func TestInboxIsTheFirstRuleThatMovesFiles(t *testing.T) {
	h := newHarness(t, nil, nil)
	if got := h.service.Inbox(t.Context()); got != h.inbox {
		t.Fatalf("inbox = %q", got)
	}
	dry := newHarness(t, nil, func(rule *Rule) { rule.DryRun = true })
	if got := dry.service.Inbox(t.Context()); got != "" {
		t.Fatalf("dry-run inbox = %q", got)
	}
}

func TestPlaceOrganizesADownloadSavedInTheInbox(t *testing.T) {
	h := newHarness(t, fakeResolver{"SSIS-001": {{Name: "X"}}}, nil)
	download := h.files.dir(h.inbox, "ssis-001ch")
	h.files.add(download, "ssis-001ch.mp4", gb)
	h.files.add(download, "广告.mp4", 10<<20)
	h.files.listFailures = map[string]int{h.inbox: 1}
	if _, err := h.service.Place(t.Context(), download, "SSIS-001"); err != nil {
		t.Fatal(err)
	}
	if got := h.files.paths("lib"); !slices.Equal(got, []string{"X/SSIS-001/SSIS-001-C.mp4"}) {
		t.Fatalf("library = %v", got)
	}
	if !slices.Contains(h.files.deleted, "ssis-001ch") {
		t.Fatalf("release folder was not recycled: %v", h.files.deleted)
	}
}

func TestPlaceLeavesAFailedInboxDownloadForTheOrganizer(t *testing.T) {
	h := newHarness(t, fakeResolver{}, func(rule *Rule) { rule.Failed = Folder{} })
	download := h.files.dir(h.inbox, "SSIS-001")
	h.files.add(download, "SSIS-001.mp4", gb)
	if _, err := h.service.Place(t.Context(), download, "SSIS-001"); !errors.Is(err, ErrNotPlaced) {
		t.Fatalf("err = %v", err)
	}
	h.service.metadata = fakeResolver{"SSIS-001": {{Name: "X"}}}
	h.poll(t)
	if got := h.files.paths("lib"); !slices.Equal(got, []string{"X/SSIS-001/SSIS-001.mp4"}) {
		t.Fatalf("library = %v", got)
	}
}

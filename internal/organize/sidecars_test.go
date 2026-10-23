package organize

import (
	"context"
	"strings"
	"testing"

	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/library/scrape"
	"github.com/ppxb/miyabi/internal/nfo"
	"github.com/ppxb/miyabi/internal/pan"
)

type recordedUploads struct {
	names, deleted []string
	bodies         map[string][]byte
}

func (files *recordedUploads) Read(_ context.Context, pickCode string, _ int64) ([]byte, error) {
	return files.bodies[pickCode], nil
}

func (files *recordedUploads) Delete(_ context.Context, ids []string, _ string) error {
	files.deleted = append(files.deleted, ids...)
	return nil
}

func (files *recordedUploads) Upload(_ context.Context, parentID, name string, _ []byte) (pan.UploadedFile, error) {
	files.names = append(files.names, parentID+"/"+name)
	return pan.UploadedFile{}, nil
}

func movieDirectory(files ...pan.File) scrape.MovieDirectory {
	directory := scrape.MovieDirectory{ID: "11", VideoIDs: map[string]bool{}, Files: files}
	for _, file := range files {
		if domain.IsVideo(file.Name) && strings.HasPrefix(file.ID, "v") {
			directory.VideoIDs[file.ID] = true
		}
	}
	return directory
}

func TestPublishSidecarsWritesMissingFilesNamedAfterTheVideo(t *testing.T) {
	recorded := &recordedUploads{}
	sidecars := &Sidecars{open: func(context.Context) (sidecarFiles, error) { return recorded, nil }}
	video := pan.File{ID: "v1", Name: "PRED-709-C.mp4", Size: domain.MinVideoSize}
	directory := movieDirectory(video, pan.File{ID: "f1", Name: "fanart.jpg"})
	sidecars.PublishSidecars(t.Context(), []scrape.MovieDirectory{directory}, nfo.Movie{Title: "t", Code: "PRED-709"},
		[]pan.File{video}, []byte("poster"), []byte("fanart"), false)
	if got := strings.Join(recorded.names, " "); got != "11/PRED-709-C.nfo 11/poster.jpg 11/thumb.jpg" {
		t.Fatalf("uploads = %s", got)
	}
}

func TestPlannedSidecarsSkipsExistingNFOAndSharedFolders(t *testing.T) {
	video := pan.File{ID: "v1", Name: "ABP-123-cd1.mp4", Size: domain.MinVideoSize}
	doc := nfo.Movie{Title: "t", Code: "ABP-123"}
	if uploads, _ := plannedSidecars(movieDirectory(video, pan.File{ID: "n", Name: "ABP-123-C.NFO"}), doc, []pan.File{video}, []byte("p"), nil, false); uploads != nil {
		t.Fatalf("overwrote an existing NFO: %+v", uploads)
	}
	other := pan.File{ID: "x1", Name: "SSIS-001.mp4", Size: domain.MinVideoSize}
	if uploads, _ := plannedSidecars(movieDirectory(video, other), doc, []pan.File{video}, []byte("p"), nil, true); uploads != nil {
		t.Fatalf("wrote artwork into a shared folder: %+v", uploads)
	}
	uploads, _ := plannedSidecars(movieDirectory(video), doc, []pan.File{video}, nil, nil, false)
	if len(uploads) != 1 || uploads[0].name != "ABP-123.nfo" {
		t.Fatalf("multi-part NFO = %+v", uploads)
	}
}

func TestPublishSidecarsReplacesTheNFOOnRebuild(t *testing.T) {
	recorded := &recordedUploads{}
	sidecars := &Sidecars{open: func(context.Context) (sidecarFiles, error) { return recorded, nil }}
	video := pan.File{ID: "v1", Name: "SSIS-037-C.mp4", Size: domain.MinVideoSize}
	directory := movieDirectory(video, pan.File{ID: "n1", Name: "SSIS-037-破解-C.nfo"}, pan.File{ID: "p", Name: "poster.jpg"})
	sidecars.PublishSidecars(t.Context(), []scrape.MovieDirectory{directory}, nfo.Movie{Title: "t", Code: "SSIS-037"},
		[]pan.File{video}, []byte("poster"), nil, true)
	if got := strings.Join(recorded.names, " "); got != "11/SSIS-037-破解-C.nfo" || strings.Join(recorded.deleted, " ") != "n1" {
		t.Fatalf("uploads = %s, deleted = %v", got, recorded.deleted)
	}
}

func TestPublishSidecarsKeepsAnUnchangedNFOOnRebuild(t *testing.T) {
	video := pan.File{ID: "v1", Name: "SSIS-037-C.mp4", Size: domain.MinVideoSize}
	doc := nfo.Movie{Title: "t", Code: "SSIS-037"}
	body, err := sidecarNFO(doc, []string{video.Name})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name    string
		current []byte
		size    int64
		want    string
	}{
		{name: "same content", current: body, size: int64(len(body)), want: "11/poster.jpg"},
		{name: "same size", current: append([]byte{'x'}, body[1:]...), size: int64(len(body)), want: "11/SSIS-037-C.nfo 11/poster.jpg"},
		{name: "other size", size: 1, want: "11/SSIS-037-C.nfo 11/poster.jpg"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorded := &recordedUploads{bodies: map[string][]byte{"pc": tc.current}}
			sidecars := &Sidecars{open: func(context.Context) (sidecarFiles, error) { return recorded, nil }}
			directory := movieDirectory(video, pan.File{ID: "n1", Name: "SSIS-037-C.nfo", Size: tc.size, PickCode: "pc"})
			sidecars.PublishSidecars(t.Context(), []scrape.MovieDirectory{directory}, doc, []pan.File{video}, []byte("poster"), nil, true)
			if got := strings.Join(recorded.names, " "); got != tc.want {
				t.Fatalf("uploads = %s, deleted = %v", got, recorded.deleted)
			}
			if kept := tc.want == "11/poster.jpg"; kept != (len(recorded.deleted) == 0) {
				t.Fatalf("deleted = %v", recorded.deleted)
			}
		})
	}
}

package export

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/ppxb/miyabi/internal/nfo"
	"github.com/ppxb/miyabi/internal/pan"
)

func TestMovieFolder(t *testing.T) {
	cases := []struct {
		source, code string
		paths        []string
		want         string
	}{
		{"/After", "PRED-709", []string{"/After/三上悠亚/PRED-709/PRED-709-C.mp4"}, "三上悠亚"},
		{"/After/", "ABP-123", []string{"/After/A,B/ABP-123/ABP-123-cd1.mp4"}, "A,B"},
		{"/After", "ABP-123", []string{"/After/多人作品/ABP-123.mp4"}, "多人作品"},
		{"/After", "ABP-123", []string{"/After/ABP-123/ABP-123.mp4"}, ""},
		{"/After", "ABP-123", []string{"/After/ABP-123.mp4"}, ""},
		{"/After", "ABP-123", []string{"/Other/X/ABP-123/ABP-123.mp4"}, ""},
		{"/After", "ABP-123", []string{"/Afterwards/X/ABP-123/ABP-123.mp4"}, ""},
		{"", "ABP-123", []string{"/After/X/ABP-123/ABP-123.mp4"}, ""},
		{"/After", "ABP-123", nil, ""},
	}
	for _, c := range cases {
		if got := MovieFolder(c.source, c.code, c.paths); got != c.want {
			t.Errorf("MovieFolder(%q, %q, %v) = %q, want %q", c.source, c.code, c.paths, got, c.want)
		}
	}
}

func TestMediaStem(t *testing.T) {
	cases := []struct {
		code   string
		videos []pan.File
		want   string
	}{
		{"PRED-709", []pan.File{{Name: "PRED-709-C.mp4"}}, "PRED-709-C"},
		{"PRED-709", []pan.File{{Name: "PRED-709.mkv"}}, "PRED-709"},
		{"PRED-709", []pan.File{{Name: "hhd800.com@PRED-709.mp4"}}, "PRED-709"},
		{"PRED-709", []pan.File{{Name: "PRED-709-C-cd1.mp4"}, {Name: "PRED-709-C-cd2.mp4"}}, "PRED-709"},
	}
	for _, c := range cases {
		if got := MediaStem(c.code, c.videos); got != c.want {
			t.Errorf("MediaStem(%q, %v) = %q, want %q", c.code, c.videos, got, c.want)
		}
	}
}

func TestWriteMovieMovesLegacyExport(t *testing.T) {
	embyDir := t.TempDir()
	cfg := Config{EmbyDir: embyDir, PublicURL: "http://localhost:8080"}
	doc := nfo.Movie{Title: "t"}
	videos := []pan.File{{ID: "v1", Name: "PRED-709-C.mp4"}}

	if _, err := WriteMedia(cfg, "PRED-709", doc, []pan.File{{ID: "v1", Name: "PRED-709.mp4"}}, nil, nil); err != nil {
		t.Fatal(err)
	}
	legacy := filepath.Join(embyDir, "PRED", "PRED-709")
	if _, err := os.Stat(filepath.Join(legacy, "PRED-709.strm")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacy, "PRED-709.zh.srt"), []byte("sub"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := WriteMovie(cfg, "三上悠亚", "PRED-709", doc, videos, nil, nil); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(embyDir, "三上悠亚", "PRED-709")
	for _, name := range []string{"PRED-709-C.strm", "PRED-709-C.nfo", "PRED-709.zh.srt"} {
		if _, err := os.Stat(filepath.Join(target, name)); err != nil {
			t.Errorf("missing %s: %v", name, err)
		}
	}
	for _, name := range []string{"PRED-709.strm", "PRED-709.nfo"} {
		if _, err := os.Stat(filepath.Join(target, name)); !os.IsNotExist(err) {
			t.Errorf("stale %s kept: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(embyDir, "PRED")); !os.IsNotExist(err) {
		t.Errorf("empty legacy prefix folder kept: %v", err)
	}
	if got := EmbyMovieDir(embyDir, "PRED-709"); got != target {
		t.Errorf("EmbyMovieDir = %q, want %q", got, target)
	}

	// A later export without a known folder stays where the movie is.
	if _, err := WriteMedia(cfg, "PRED-709", doc, videos, nil, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(target, "PRED-709-C.strm")); err != nil {
		t.Fatal(err)
	}

	// Moving actors on 115 moves the export along.
	if _, err := WriteMovie(cfg, "多人作品", "PRED-709", doc, videos, nil, nil); err != nil {
		t.Fatal(err)
	}
	moved := filepath.Join(embyDir, "多人作品", "PRED-709", "PRED-709-C.strm")
	if _, err := os.Stat(moved); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(embyDir, "三上悠亚")); !os.IsNotExist(err) {
		t.Errorf("empty actor folder kept: %v", err)
	}
}

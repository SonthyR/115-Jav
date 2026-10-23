package nfo

import (
	"slices"
	"testing"
)

func TestForMediaServerPrefixesTheCodeAndMarksChineseSubtitles(t *testing.T) {
	doc := Movie{Code: "IPZZ-457", Title: "美脚女教師", Genres: []string{"单体作品"}}
	got := ForMediaServer(doc, []string{"IPZZ-457-C-cd1.mp4"})
	if got.Title != "IPZZ-457 美脚女教師" || !slices.Equal(got.Genres, []string{"单体作品", ChineseGenre}) {
		t.Fatalf("ForMediaServer = %q %q", got.Title, got.Genres)
	}
	if doc.Genres[0] != "单体作品" || len(doc.Genres) != 1 {
		t.Fatalf("input changed: %q", doc.Genres)
	}
	again := ForMediaServer(got, []string{"IPZZ-457-C.mp4"})
	if again.Title != got.Title || len(again.Genres) != 2 {
		t.Fatalf("not idempotent: %q %q", again.Title, again.Genres)
	}
	if plain := ForMediaServer(doc, []string{"IPZZ-457.mp4", "IPZZ-457-cd2.mp4"}); len(plain.Genres) != 1 {
		t.Fatalf("marked a plain release: %q", plain.Genres)
	}
	SetTitleCode(false)
	defer SetTitleCode(true)
	if off := ForMediaServer(doc, nil); off.Title != "美脚女教師" {
		t.Fatalf("title with the setting off = %q", off.Title)
	}
}

func TestDecodeDropsTheCodeInFrontOfTheTitle(t *testing.T) {
	for title, want := range map[string]string{
		"SSIS-037 三上悠亚想要": "三上悠亚想要",
		"ssis-037　タイトル":   "タイトル",
		"SSIS-0370 別作品":   "SSIS-0370 別作品",
		"SSIS-037":        "SSIS-037",
	} {
		body, err := Encode(Movie{Code: "SSIS-037", Title: title})
		if err != nil {
			t.Fatal(err)
		}
		if got, err := Decode(body); err != nil || got.Title != want {
			t.Errorf("Decode(%q).Title = %q, want %q (%v)", title, got.Title, want, err)
		}
	}
}

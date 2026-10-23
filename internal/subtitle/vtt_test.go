package subtitle

import (
	"strings"
	"testing"
)

func TestToVTTConvertsSRT(t *testing.T) {
	got := ToVTT("1\r\n0:01:02,5 --> 00:01:04,250\r\n你好\r\n", "srt")
	want := "WEBVTT\n\n1\n00:01:02.500 --> 00:01:04.250\n你好\n"
	if !strings.HasPrefix(got, want) {
		t.Fatalf("ToVTT() = %q, want prefix %q", got, want)
	}
}

func TestToVTTConvertsASSDialogue(t *testing.T) {
	text := "[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
		"Dialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\an8}第一行\\N第二行, 逗号\n"
	got := ToVTT(text, "ass")
	want := "WEBVTT\n\n00:00:01.500 --> 00:00:03.000\n第一行\n第二行, 逗号\n\n"
	if got != want {
		t.Fatalf("ToVTT() = %q, want %q", got, want)
	}
}

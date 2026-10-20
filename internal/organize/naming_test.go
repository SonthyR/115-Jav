package organize

import "testing"

func TestActorDirectory(t *testing.T) {
	for _, test := range []struct {
		actors []string
		want   string
	}{
		{nil, UnknownActor},
		{[]string{" "}, UnknownActor},
		{[]string{"楪カレン"}, "楪カレン"},
		{[]string{"楪カレン", "逢沢みゆ"}, "楪カレン,逢沢みゆ"},
		{[]string{"桜木优希音", "佐野あおい", "土屋あさみ"}, "桜木优希音,佐野あおい,土屋あさみ"},
		{[]string{"a", "b", "c", "d"}, ManyActors},
		{[]string{"楪カレン", "楪カレン"}, "楪カレン"},
		{[]string{"AC/DC?"}, "AC／DC？"},
	} {
		if got := ActorDirectory(test.actors, 0); got != test.want {
			t.Errorf("ActorDirectory(%q) = %q, want %q", test.actors, got, test.want)
		}
	}
}

func TestParseMarks(t *testing.T) {
	for _, test := range []struct {
		name, code string
		want       Marks
	}{
		{"PRED-709-C.mp4", "PRED-709", Marks{Chinese: true}},
		{"pred-375-C.mp4", "PRED-375", Marks{Chinese: true}},
		{"[98t.tv]pred-403-C.mp4", "PRED-403", Marks{Chinese: true}},
		{"[98t.tv]pppe-040.mp4", "PPPE-040", Marks{}},
		{"ABP-123C.mp4", "ABP-123", Marks{Chinese: true}},
		{"abp123-uc.mkv", "ABP-123", Marks{Chinese: true}},
		{"ABP-123_ch.mp4", "ABP-123", Marks{Chinese: true}},
		{"ABP-123 中文字幕.mp4", "ABP-123", Marks{Chinese: true}},
		{"ABP-123-CD1.mp4", "ABP-123", Marks{Part: 1}},
		{"ABP-123-cd2.mp4", "ABP-123", Marks{Part: 2}},
		{"ABP-123-C-CD2.mp4", "ABP-123", Marks{Chinese: true, Part: 2}},
		{"ABP-123-A.mp4", "ABP-123", Marks{Part: 1}},
		{"ABP-123-B.mp4", "ABP-123", Marks{Part: 2}},
		{"ABP-123_2.mp4", "ABP-123", Marks{Part: 2}},
		{"ABP-1234.mp4", "ABP-123", Marks{}},
		{"ABP-123-4K.mp4", "ABP-123", Marks{}},
	} {
		if got := ParseMarks(test.name, test.code); got != test.want {
			t.Errorf("ParseMarks(%q) = %+v, want %+v", test.name, got, test.want)
		}
	}
}

func TestVideoName(t *testing.T) {
	for _, test := range []struct {
		chinese     bool
		part, parts int
		want        string
	}{
		{true, 0, 1, "PRED-709-C.mp4"},
		{false, 1, 1, "PRED-709.mp4"},
		{true, 2, 2, "PRED-709-C-cd2.mp4"},
	} {
		if got := VideoName("pred-709", test.chinese, test.part, test.parts, ".MP4"); got != test.want {
			t.Errorf("VideoName = %q, want %q", got, test.want)
		}
	}
}

func TestResolveActorDirectoryReusesExistingSpelling(t *testing.T) {
	existing := []string{"三上悠亚", "七泽美亚", "楪カレン,逢沢みゆ", "希崎洁西卡"}
	for _, test := range []struct {
		actors []Actor
		want   string
	}{
		{[]Actor{{Name: "三上悠亜"}}, "三上悠亚"},
		{[]Actor{{Name: "七沢みあ", Aliases: []string{"七澤美亞"}}}, "七泽美亚"},
		{[]Actor{{Name: "逢沢みゆ"}, {Name: "楪カレン"}}, "楪カレン,逢沢みゆ"},
		{[]Actor{{Name: "三上悠亜"}, {Name: "新人"}}, "三上悠亚,新人"},
		{[]Actor{{Name: "新しい人"}}, "新しい人"},
		{nil, UnknownActor},
	} {
		if got := ResolveActorDirectory(test.actors, 0, existing); got != test.want {
			t.Errorf("ResolveActorDirectory(%+v) = %q, want %q", test.actors, got, test.want)
		}
	}
}

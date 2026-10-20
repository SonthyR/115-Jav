// Package organize moves identified videos on 115 into the library layout
// {library}/{actors}/{code}/{code}{-C}{-cdN}.{ext} and stores their sidecars.
package organize

import (
	"path"
	"regexp"
	"strconv"
	"strings"

	"github.com/ppxb/miyabi/internal/codeid"
)

const (
	UnknownActor = "未知演员"
	ManyActors   = "多人作品"
	// DefaultMaxActors matches the existing library: up to three names per folder.
	DefaultMaxActors = 3
)

// 115 rejects these characters in names; full-width forms keep names readable.
var unsafeName = strings.NewReplacer(
	"/", "／", "\\", "＼", ":", "：", "*", "＊", "?", "？", "\"", "＂", "<", "＜", ">", "＞", "|", "｜",
)

// SafeName makes one path component acceptable to 115.
func SafeName(name string) string {
	name = strings.TrimSpace(unsafeName.Replace(name))
	return strings.Trim(name, ". ")
}

// ActorDirectory names the actor folder: one to max names joined by commas,
// ManyActors above max and UnknownActor without names.
func ActorDirectory(actors []string, max int) string {
	if max <= 0 {
		max = DefaultMaxActors
	}
	names := make([]string, 0, len(actors))
	seen := make(map[string]bool)
	for _, actor := range actors {
		name := SafeName(actor)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	switch {
	case len(names) == 0:
		return UnknownActor
	case len(names) > max:
		return ManyActors
	}
	return strings.Join(names, ",")
}

// Video file name markers for embedded Chinese subtitles: ABP-123-C, ABP-123C,
// ABP-123-UC, ABP-123_ch, or 中文字幕 anywhere in the name.
var (
	chineseWords  = regexp.MustCompile(`中文字幕|中字`)
	chineseSuffix = regexp.MustCompile(`^[-_ .]?(?:U?C|CH)(?:[^A-Z0-9]|$)`)
	partSuffix    = regexp.MustCompile(`^[-_ .]?(?:CD|PART|DISC|PT)[-_ .]?([0-9]{1,2})(?:[^A-Z0-9]|$)`)
	letterPart    = regexp.MustCompile(`^[-_ .]([A-D])(?:[^A-Z0-9]|$)`)
	digitPart     = regexp.MustCompile(`^[-_ .]([1-9])(?:[^A-Z0-9]|$)`)
)

// Marks describes what a source file name says beyond the catalogue code.
type Marks struct {
	Chinese bool
	// Part is 1-based when the name carries a part marker, otherwise 0.
	Part int
}

// ParseMarks reads subtitle and part markers that follow the code in name.
func ParseMarks(name, code string) Marks {
	var marks Marks
	stem := strings.TrimSuffix(name, path.Ext(name))
	marks.Chinese = chineseWords.MatchString(stem)
	rest, ok := afterCode(strings.ToUpper(stem), code)
	if !ok {
		return marks
	}
	if match := chineseSuffix.FindStringIndex(rest); match != nil {
		marks.Chinese = true
		// Keep the terminator as the separator of a following part marker.
		rest = rest[max(match[1]-1, 0):]
	}
	if match := partSuffix.FindStringSubmatch(rest); match != nil {
		marks.Part, _ = strconv.Atoi(match[1])
	} else if match := letterPart.FindStringSubmatch(rest); match != nil {
		marks.Part = int(match[1][0]-'A') + 1
	} else if match := digitPart.FindStringSubmatch(rest); match != nil {
		marks.Part, _ = strconv.Atoi(match[1])
	}
	return marks
}

// afterCode returns the upper-cased text after the code, tolerating the
// separators and zero padding that release names use (ABP123, abp_0123).
func afterCode(upper, code string) (string, bool) {
	prefix, number, found := strings.Cut(codeid.Normalize(code), "-")
	if !found {
		index := strings.Index(upper, strings.ToUpper(code))
		if index < 0 {
			return "", false
		}
		return upper[index+len(code):], true
	}
	pattern := regexp.MustCompile(`(?:^|[^A-Z0-9])` + regexp.QuoteMeta(prefix) + `[-_ .]?0*` + regexp.QuoteMeta(strings.TrimLeft(number, "0")))
	match := pattern.FindStringIndex(upper)
	if match == nil {
		return "", false
	}
	return upper[match[1]:], true
}

// VideoName is the organized file name: {code}{-C}{-cdN}{ext}. part is
// 1-based and only written when the movie has more than one video.
func VideoName(code string, chinese bool, part, parts int, ext string) string {
	name := SafeName(codeid.Normalize(code))
	if chinese {
		name += "-C"
	}
	if parts > 1 && part > 0 {
		name += "-cd" + strconv.Itoa(part)
	}
	return name + strings.ToLower(ext)
}

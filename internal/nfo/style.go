package nfo

import (
	"path"
	"regexp"
	"slices"
	"strings"
	"sync/atomic"
)

// ChineseGenre marks movies whose video carries embedded Chinese subtitles.
const ChineseGenre = "中文字幕"

var (
	// Emby searches titles only, so the code is written in front by default.
	titleCode atomic.Bool
	// Organized names end with -C; release names also use UC and CH.
	chineseStem  = regexp.MustCompile(`(?i)[-_ .](?:U?C|CH)$`)
	partSuffix   = regexp.MustCompile(`(?i)[-_ .]cd[0-9]+$`)
	chineseWords = regexp.MustCompile(`中文字幕|中字`)
)

func init() { titleCode.Store(true) }

// SetTitleCode chooses whether exported titles start with the code.
func SetTitleCode(on bool) { titleCode.Store(on) }

// ForMediaServer is the document as written next to the videos for Emby:
// the code in front of the title, and a Chinese-subtitle genre when a video
// name says so.
func ForMediaServer(doc Movie, videoNames []string) Movie {
	if doc.Code != "" && titleCode.Load() && !strings.HasPrefix(strings.ToUpper(doc.Title), strings.ToUpper(doc.Code)) {
		doc.Title = strings.TrimSpace(doc.Code + " " + doc.Title)
	}
	if slices.ContainsFunc(videoNames, hasChineseMark) && !slices.Contains(doc.Genres, ChineseGenre) {
		doc.Genres = append(slices.Clone(doc.Genres), ChineseGenre)
	}
	return doc
}

func hasChineseMark(name string) bool {
	stem := strings.TrimSuffix(name, path.Ext(name))
	stem = partSuffix.ReplaceAllString(stem, "")
	return chineseStem.MatchString(stem) || chineseWords.MatchString(stem)
}

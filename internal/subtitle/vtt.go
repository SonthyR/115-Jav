package subtitle

import (
	"regexp"
	"strings"
)

var (
	srtTime  = regexp.MustCompile(`(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{1,3})`)
	assTag   = regexp.MustCompile(`\{[^}]*\}`)
	assClock = regexp.MustCompile(`^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$`)
)

// ToVTT converts subtitle text to WebVTT for browser playback. ASS styling
// is dropped; the player applies its own subtitle style.
func ToVTT(text, format string) string {
	text = strings.ReplaceAll(strings.TrimPrefix(text, "\uFEFF"), "\r\n", "\n")
	switch strings.ToLower(format) {
	case "vtt":
		return text
	case "ass", "ssa":
		return assToVTT(text)
	}
	var out strings.Builder
	out.WriteString("WEBVTT\n\n")
	for _, line := range strings.Split(text, "\n") {
		if strings.Contains(line, "-->") {
			line = srtTime.ReplaceAllStringFunc(line, func(stamp string) string {
				return vttStamp(srtTime.FindStringSubmatch(stamp))
			})
		}
		out.WriteString(line)
		out.WriteByte('\n')
	}
	return out.String()
}

func vttStamp(parts []string) string {
	hours := strings.TrimSuffix(parts[1], ":")
	if hours == "" {
		hours = "0"
	}
	millis := (parts[4] + "00")[:3]
	if len(parts[4]) == 2 {
		// ASS uses centiseconds.
		millis = parts[4] + "0"
	}
	return pad(hours) + ":" + pad(parts[2]) + ":" + parts[3] + "." + millis
}

func pad(value string) string {
	if len(value) < 2 {
		return "0" + value
	}
	return value
}

func assToVTT(text string) string {
	var out strings.Builder
	out.WriteString("WEBVTT\n\n")
	fields := []string{"layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"}
	events := false
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		lower := strings.ToLower(line)
		switch {
		case strings.HasPrefix(line, "["):
			events = lower == "[events]"
		case events && strings.HasPrefix(lower, "format:"):
			fields = strings.Split(strings.ToLower(strings.ReplaceAll(line[len("format:"):], " ", "")), ",")
		case events && strings.HasPrefix(lower, "dialogue:"):
			values := strings.SplitN(line[len("dialogue:"):], ",", len(fields))
			if len(values) < len(fields) {
				continue
			}
			cue := map[string]string{}
			for i, name := range fields {
				cue[name] = strings.TrimSpace(values[i])
			}
			start, end := assClock.FindStringSubmatch(cue["start"]), assClock.FindStringSubmatch(cue["end"])
			body := strings.TrimSpace(assTag.ReplaceAllString(values[len(fields)-1], ""))
			if start == nil || end == nil || body == "" {
				continue
			}
			body = strings.NewReplacer(`\N`, "\n", `\n`, "\n", `\h`, " ").Replace(body)
			out.WriteString(vttStamp([]string{"", start[1] + ":", start[2], start[3], start[4]}) + " --> " +
				vttStamp([]string{"", end[1] + ":", end[2], end[3], end[4]}) + "\n" + body + "\n\n")
		}
	}
	return out.String()
}

package api

import (
	"cmp"
	"fmt"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/ppxb/miyabi/internal/domain"
	lib "github.com/ppxb/miyabi/internal/library"
	"github.com/ppxb/miyabi/internal/subtitle"
)

// Emby counts a movie as played past this share of its length and keeps no
// resume point before the first share.
const (
	embyPlayedShare = 0.9
	embyResumeShare = 0.05
)

type embyMediaSource struct {
	Protocol                   string            `json:"Protocol"`
	Id                         string            `json:"Id"`
	ItemId                     string            `json:"ItemId"`
	Path                       string            `json:"Path"`
	Type                       string            `json:"Type"`
	Container                  string            `json:"Container"`
	Size                       int64             `json:"Size,omitempty"`
	Name                       string            `json:"Name"`
	IsRemote                   bool              `json:"IsRemote"`
	RunTimeTicks               int64             `json:"RunTimeTicks,omitempty"`
	SupportsTranscoding        bool              `json:"SupportsTranscoding"`
	SupportsDirectStream       bool              `json:"SupportsDirectStream"`
	SupportsDirectPlay         bool              `json:"SupportsDirectPlay"`
	IsInfiniteStream           bool              `json:"IsInfiniteStream"`
	RequiresOpening            bool              `json:"RequiresOpening"`
	RequiresClosing            bool              `json:"RequiresClosing"`
	RequiresLooping            bool              `json:"RequiresLooping"`
	SupportsProbing            bool              `json:"SupportsProbing"`
	ReadAtNativeFramerate      bool              `json:"ReadAtNativeFramerate"`
	MediaStreams               []embyStream      `json:"MediaStreams"`
	Formats                    []string          `json:"Formats"`
	RequiredHttpHeaders        map[string]string `json:"RequiredHttpHeaders"`
	DirectStreamUrl            string            `json:"DirectStreamUrl"`
	AddApiKeyToDirectStreamUrl bool              `json:"AddApiKeyToDirectStreamUrl"`
}

type embyStream struct {
	Type                   string `json:"Type"`
	Index                  int    `json:"Index"`
	Codec                  string `json:"Codec,omitempty"`
	Language               string `json:"Language,omitempty"`
	Title                  string `json:"Title,omitempty"`
	DisplayTitle           string `json:"DisplayTitle,omitempty"`
	IsDefault              bool   `json:"IsDefault"`
	IsForced               bool   `json:"IsForced"`
	IsExternal             bool   `json:"IsExternal"`
	IsTextSubtitleStream   bool   `json:"IsTextSubtitleStream"`
	SupportsExternalStream bool   `json:"SupportsExternalStream"`
	DeliveryMethod         string `json:"DeliveryMethod,omitempty"`
	DeliveryUrl            string `json:"DeliveryUrl,omitempty"`
	IsExternalUrl          bool   `json:"IsExternalUrl,omitempty"`
}

func videoContainer(name string) string {
	if ext := strings.TrimPrefix(strings.ToLower(path.Ext(name)), "."); ext != "" {
		return ext
	}
	return "mp4"
}

// subtitleLanguages maps the culture codes subtitles are saved with to the
// three-letter codes Emby players expect.
var subtitleLanguages = map[string][2]string{
	"zh-cn": {"chi", "简体中文"}, "zh-tw": {"chi", "繁体中文"}, "zh": {"chi", "中文"},
	"ja": {"jpn", "日语"}, "en": {"eng", "英语"},
}

// mediaSources lists each video of a movie, versions or parts, as a source
// the player streams directly; the stream URL redirects to 115.
func (s *embyServer) mediaSources(movie lib.Movie, info lib.PlayInfo) []embyMediaSource {
	sources := make([]embyMediaSource, 0, len(info.Files))
	for _, file := range info.Files {
		container := videoContainer(file.Name)
		streams := []embyStream{{Type: "Video", Index: 0, IsDefault: true, DisplayTitle: strings.ToUpper(container)}}
		for i, track := range info.Subtitles {
			format := strings.ToLower(track.Format)
			if format != "ass" && format != "ssa" && format != "vtt" {
				format = "srt"
			}
			language := subtitleLanguages[strings.ToLower(track.Language)]
			index := i + 1
			streams = append(streams, embyStream{
				Type: "Subtitle", Index: index, Codec: format, Language: language[0],
				Title: track.Name, DisplayTitle: strings.TrimSpace(language[1] + " " + strings.ToUpper(format)),
				IsExternal: true, IsTextSubtitleStream: true, SupportsExternalStream: true, DeliveryMethod: "External",
				DeliveryUrl: fmt.Sprintf("/Videos/%d/%s/Subtitles/%d/0/Stream.%s?api_key=%s",
					movie.ID, file.FileID, index, format, s.token()),
			})
		}
		sources = append(sources, embyMediaSource{
			Protocol: "File", Id: file.FileID, ItemId: strconv.Itoa(movie.ID), Path: file.Name, Type: "Default",
			Container: container, Size: file.Size, Name: strings.TrimSuffix(file.Name, path.Ext(file.Name)),
			RunTimeTicks:       int64(movie.Duration) * 60 * ticksPerSecond,
			SupportsDirectPlay: true, SupportsDirectStream: true,
			MediaStreams: streams, Formats: []string{}, RequiredHttpHeaders: map[string]string{},
			DirectStreamUrl: fmt.Sprintf("/Videos/%d/stream.%s?MediaSourceId=%s&Static=true&api_key=%s",
				movie.ID, container, file.FileID, s.token()),
		})
	}
	return sources
}

func (s *embyServer) playbackInfo(r *embyRequest) {
	ctx := r.ctx()
	ref, ok := s.ref(ctx, r.param("id"))
	if !ok || ref.kind != "movie" {
		r.fail(domain.E(domain.KindNotFound, "影片不存在", nil))
		return
	}
	movie, err := s.movie(ctx, ref.id)
	if err != nil {
		r.fail(err)
		return
	}
	info, err := s.library.PlayInfo(ctx, ref.id)
	if err != nil {
		r.fail(err)
		return
	}
	sources := s.mediaSources(movie, info)
	if wanted := r.q("mediasourceid"); wanted != "" {
		for _, source := range sources {
			if source.Id == wanted {
				sources = []embyMediaSource{source}
				break
			}
		}
	}
	r.JSON(http.StatusOK, map[string]any{"MediaSources": sources, "PlaySessionId": fmt.Sprintf("%d-%d", ref.id, len(sources))})
}

// videoOf picks the requested video of a movie, or its first one.
func (s *embyServer) videoOf(r *embyRequest, movieID int, wanted string) (string, error) {
	info, err := s.library.PlayInfo(r.ctx(), movieID)
	if err != nil {
		return "", err
	}
	if len(info.Files) == 0 {
		return "", domain.E(domain.KindNotFound, "影片没有视频文件", nil)
	}
	for _, file := range info.Files {
		if file.FileID == wanted {
			return file.FileID, nil
		}
	}
	return info.Files[0].FileID, nil
}

// stream redirects the player to the 115 video, like an exported STRM file.
func (s *embyServer) stream(r *embyRequest) {
	ref, ok := s.ref(r.ctx(), r.param("id"))
	if !ok || ref.kind != "movie" {
		r.fail(domain.E(domain.KindNotFound, "影片不存在", nil))
		return
	}
	fileID, err := s.videoOf(r, ref.id, r.q("mediasourceid"))
	if err != nil {
		r.fail(err)
		return
	}
	redirectStream(r.Context, s.relay, fileID)
}

// subtitle serves a saved subtitle in the format the player asks for by
// extension; players render SRT and ASS themselves, so those stay as saved.
func (s *embyServer) subtitle(r *embyRequest) {
	ref, ok := s.ref(r.ctx(), r.param("id"))
	index, err := strconv.Atoi(r.param("index"))
	if !ok || ref.kind != "movie" || err != nil || s.subtitles == nil {
		r.Status(http.StatusNotFound)
		return
	}
	info, err := s.library.PlayInfo(r.ctx(), ref.id)
	if err != nil {
		r.fail(err)
		return
	}
	if index < 1 || index > len(info.Subtitles) {
		r.Status(http.StatusNotFound)
		return
	}
	text, format, err := s.subtitles.Source(r.ctx(), ref.id, info.Subtitles[index-1].ID)
	if err != nil {
		r.fail(err)
		return
	}
	switch strings.TrimPrefix(strings.ToLower(path.Ext(r.param("file"))), ".") {
	case "vtt":
		r.Data(http.StatusOK, "text/vtt; charset=utf-8", []byte(subtitle.ToVTT(text, format)))
	case "srt":
		r.Data(http.StatusOK, "application/x-subrip; charset=utf-8", []byte(subtitle.ToSRT(text, format)))
	default:
		r.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(text))
	}
}

func embyNumber(value any, fallback string) float64 {
	switch number := value.(type) {
	case float64:
		return number
	case string:
		parsed, _ := strconv.ParseFloat(number, 64)
		return parsed
	}
	parsed, _ := strconv.ParseFloat(fallback, 64)
	return parsed
}

func embyString(value any, fallback string) string {
	if text, ok := value.(string); ok && text != "" {
		return text
	}
	return fallback
}

// embyReport saves where playback is. Players report while playing and when
// they stop; legacy players put the values in the query.
func embyReport(stopped bool) func(*embyServer, *embyRequest) {
	return func(s *embyServer, r *embyRequest) {
		ctx := r.ctx()
		body := r.body()
		ref, ok := s.ref(ctx, embyString(body["itemid"], cmp.Or(r.param("id"), r.q("itemid"))))
		position := embyNumber(body["positionticks"], r.q("positionticks")) / ticksPerSecond
		if !ok || ref.kind != "movie" || (!stopped && position <= 0) {
			r.noContent()
			return
		}
		movie, err := s.movie(ctx, ref.id)
		if err != nil {
			r.fail(err)
			return
		}
		states, err := s.library.PlayStates(ctx)
		if err != nil {
			r.fail(err)
			return
		}
		duration := movieSeconds(movie, states[ref.id])
		switch {
		case stopped && duration > 0 && position >= duration*embyPlayedShare:
			err = s.library.MarkPlayed(ctx, ref.id, true)
		case position <= 0 || (stopped && duration > 0 && position < duration*embyResumeShare):
		default:
			var fileID string
			fileID, err = s.videoOf(r, ref.id, embyString(body["mediasourceid"], r.q("mediasourceid")))
			if err == nil {
				err = s.library.SaveProgress(ctx, ref.id, lib.Progress{FileID: fileID, Position: position, Duration: duration})
			}
		}
		if err != nil {
			r.fail(err)
			return
		}
		r.noContent()
	}
}

func (s *embyServer) movieRef(r *embyRequest) (int, bool) {
	ref, ok := s.ref(r.ctx(), r.param("id"))
	if !ok || ref.kind != "movie" {
		r.fail(domain.E(domain.KindNotFound, "影片不存在", nil))
		return 0, false
	}
	return ref.id, true
}

func embySetPlayed(played bool) func(*embyServer, *embyRequest) {
	return func(s *embyServer, r *embyRequest) {
		if id, ok := s.movieRef(r); ok {
			if err := s.library.MarkPlayed(r.ctx(), id, played); err != nil {
				r.fail(err)
				return
			}
			s.userDataOf(r)
		}
	}
}

func (s *embyServer) favorite(r *embyRequest, id int, favorite bool) error {
	collection, err := s.favoriteCollection(r.ctx(), favorite)
	if err != nil || collection == 0 {
		return err
	}
	if favorite {
		return s.library.AddToCollection(r.ctx(), collection, id)
	}
	return s.library.RemoveFromCollection(r.ctx(), collection, id)
}

func embySetFavorite(favorite bool) func(*embyServer, *embyRequest) {
	return func(s *embyServer, r *embyRequest) {
		if id, ok := s.movieRef(r); ok {
			if err := s.favorite(r, id, favorite); err != nil {
				r.fail(err)
				return
			}
			s.userDataOf(r)
		}
	}
}

// updateUserData applies the fields a player sends of its own user data.
func (s *embyServer) updateUserData(r *embyRequest) {
	id, ok := s.movieRef(r)
	if !ok {
		return
	}
	body := r.body()
	var err error
	if favorite, ok := body["isfavorite"].(bool); ok {
		err = s.favorite(r, id, favorite)
	}
	if played, ok := body["played"].(bool); ok && err == nil {
		err = s.library.MarkPlayed(r.ctx(), id, played)
	}
	if ticks, ok := body["playbackpositionticks"].(float64); ok && ticks > 0 && err == nil {
		var fileID string
		if fileID, err = s.videoOf(r, id, ""); err == nil {
			err = s.library.SaveProgress(r.ctx(), id, lib.Progress{FileID: fileID, Position: ticks / ticksPerSecond})
		}
	}
	if err != nil {
		r.fail(err)
		return
	}
	s.userDataOf(r)
}

func (s *embyServer) userDataOf(r *embyRequest) {
	id, ok := s.movieRef(r)
	if !ok {
		return
	}
	movie, err := s.movie(r.ctx(), id)
	if err != nil {
		r.fail(err)
		return
	}
	state, err := s.state(r.ctx())
	if err != nil {
		r.fail(err)
		return
	}
	r.JSON(http.StatusOK, state.userData(movie))
}

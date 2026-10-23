package api

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/ppxb/miyabi/internal/domain"
	lib "github.com/ppxb/miyabi/internal/library"
	"github.com/ppxb/miyabi/internal/pan"
	"github.com/ppxb/miyabi/internal/subtitle"
)

type PlaybackManager interface {
	PlayInfo(context.Context, int) (lib.PlayInfo, error)
	SaveProgress(context.Context, int, lib.Progress) error
	ClearProgress(context.Context, int) error
	ContinueWatching(context.Context) ([]lib.ContinueItem, error)
}

type SubtitlePlayer interface {
	Track(context.Context, int, int) (string, error)
	Search(context.Context, int) ([]subtitle.SearchResult, error)
	Fetch(context.Context, int, int) (string, error)
}

// TranscodeRelay lists and proxies 115 HLS streams. Browsers fetch HLS with
// XHR, which the 115 CDN does not allow cross-origin, so the server relays it.
type TranscodeRelay interface {
	Transcodes(context.Context, string, string) ([]pan.PlaySource, error)
	Open(context.Context, string, http.Header) (*http.Response, error)
}

// maxPlaylist bounds an HLS playlist read for rewriting.
const maxPlaylist = 4 << 20

// hlsSigner signs relayed URLs so the proxy only fetches URLs 115 returned.
type hlsSigner struct{ key []byte }

func newHLSSigner() hlsSigner {
	key := make([]byte, 32)
	_, _ = rand.Read(key)
	return hlsSigner{key: key}
}

func (s hlsSigner) sign(address string) string {
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte(address))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s hlsSigner) proxyURL(address string) string {
	return "/api/play/hls?" + url.Values{"u": {address}, "s": {s.sign(address)}}.Encode()
}

func (s hlsSigner) valid(address, signature string) bool {
	return hmac.Equal([]byte(s.sign(address)), []byte(signature))
}

type libraryMovieURI struct {
	ID int `uri:"id" binding:"min=1"`
}

func playInfoHandler(playback PlaybackManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if uri, ok := bindURI[libraryMovieURI](c); ok {
			info, err := playback.PlayInfo(c.Request.Context(), uri.ID)
			respond(c, info, err)
		}
	}
}

func saveProgressHandler(playback PlaybackManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		uri, ok := bindURI[libraryMovieURI](c)
		if !ok {
			return
		}
		input, ok := bindJSON[struct {
			FileID   string  `json:"file_id" binding:"required,max=128"`
			Position float64 `json:"position" binding:"min=0"`
			Duration float64 `json:"duration" binding:"min=0"`
		}](c)
		if !ok {
			return
		}
		err := playback.SaveProgress(c.Request.Context(), uri.ID, lib.Progress{FileID: input.FileID, Position: input.Position, Duration: input.Duration})
		respond(c, gin.H{}, err)
	}
}

func clearProgressHandler(playback PlaybackManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if uri, ok := bindURI[libraryMovieURI](c); ok {
			respond(c, gin.H{}, playback.ClearProgress(c.Request.Context(), uri.ID))
		}
	}
}

func continueWatchingHandler(playback PlaybackManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		items, err := playback.ContinueWatching(c.Request.Context())
		respond(c, items, err)
	}
}

func vtt(c *gin.Context, text string, err error) {
	if err != nil {
		c.Error(err)
		return
	}
	c.Data(http.StatusOK, "text/vtt; charset=utf-8", []byte(text))
}

func subtitleTrackHandler(player SubtitlePlayer) gin.HandlerFunc {
	return func(c *gin.Context) {
		uri, ok := bindURI[struct {
			ID         int `uri:"id" binding:"min=1"`
			SubtitleID int `uri:"subtitleID" binding:"min=1"`
		}](c)
		if ok {
			text, err := player.Track(c.Request.Context(), uri.ID, uri.SubtitleID)
			vtt(c, text, err)
		}
	}
}

func subtitleSearchHandler(player SubtitlePlayer) gin.HandlerFunc {
	return func(c *gin.Context) {
		if uri, ok := bindURI[libraryMovieURI](c); ok {
			results, err := player.Search(c.Request.Context(), uri.ID)
			respond(c, results, err)
		}
	}
}

func subtitleFetchHandler(player SubtitlePlayer) gin.HandlerFunc {
	return func(c *gin.Context) {
		uri, ok := bindURI[struct {
			ID    int `uri:"id" binding:"min=1"`
			Index int `uri:"index" binding:"min=0"`
		}](c)
		if ok {
			text, err := player.Fetch(c.Request.Context(), uri.ID, uri.Index)
			vtt(c, text, err)
		}
	}
}

type transcodeSource struct {
	Height     int    `json:"height"`
	Definition int    `json:"definition"`
	URL        string `json:"url"`
}

func transcodesHandler(relay TranscodeRelay, signer hlsSigner) gin.HandlerFunc {
	return func(c *gin.Context) {
		uri, ok := bindURI[struct {
			FileID string `uri:"fileID" binding:"required,max=128"`
		}](c)
		if !ok {
			return
		}
		sources, err := relay.Transcodes(c.Request.Context(), uri.FileID, c.Request.UserAgent())
		result := make([]transcodeSource, 0, len(sources))
		for _, source := range sources {
			result = append(result, transcodeSource{Height: source.Height, Definition: source.Definition, URL: signer.proxyURL(source.URL)})
		}
		respond(c, result, err)
	}
}

// hlsProxyHandler relays a signed 115 HLS URL. Playlists are rewritten so
// nested playlists, keys and segments go through the proxy as well.
func hlsProxyHandler(relay TranscodeRelay, signer hlsSigner) gin.HandlerFunc {
	return func(c *gin.Context) {
		address, signature := c.Query("u"), c.Query("s")
		base, err := url.Parse(address)
		if err != nil || !signer.valid(address, signature) || (base.Scheme != "https" && base.Scheme != "http") {
			c.Error(domain.E(domain.KindInvalid, "无效的播放地址", err))
			return
		}
		response, err := relay.Open(c.Request.Context(), address, c.Request.Header)
		if err != nil {
			c.Error(domain.E(domain.KindUpstream, "读取 115 转码流失败", err))
			return
		}
		defer response.Body.Close()
		reader := bufio.NewReader(response.Body)
		head, _ := reader.Peek(7)
		if response.StatusCode == http.StatusOK && string(head) == "#EXTM3U" {
			body, err := io.ReadAll(io.LimitReader(reader, maxPlaylist))
			if err != nil {
				c.Error(domain.E(domain.KindUpstream, "读取 115 转码流失败", err))
				return
			}
			c.Header("Cache-Control", "no-store")
			c.Data(http.StatusOK, "application/vnd.apple.mpegurl", rewritePlaylist(body, base, signer))
			return
		}
		for _, name := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"} {
			if value := response.Header.Get(name); value != "" {
				c.Header(name, value)
			}
		}
		c.Status(response.StatusCode)
		_, _ = io.Copy(c.Writer, reader)
	}
}

func rewritePlaylist(body []byte, base *url.URL, signer hlsSigner) []byte {
	resolve := func(ref string) string {
		target, err := base.Parse(strings.TrimSpace(ref))
		if err != nil {
			return ref
		}
		return signer.proxyURL(target.String())
	}
	var out bytes.Buffer
	for _, line := range strings.Split(strings.ReplaceAll(string(body), "\r\n", "\n"), "\n") {
		switch {
		case line == "":
		case strings.HasPrefix(line, "#"):
			// Keys and alternate renditions name their URL in a URI attribute.
			if start := strings.Index(line, `URI="`); start >= 0 {
				end := strings.Index(line[start+5:], `"`)
				if end >= 0 {
					ref := line[start+5 : start+5+end]
					line = line[:start+5] + resolve(ref) + line[start+5+end:]
				}
			}
		default:
			line = resolve(line)
		}
		fmt.Fprintln(&out, line)
	}
	return out.Bytes()
}

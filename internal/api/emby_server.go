package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ppxb/miyabi/internal/domain"
	lib "github.com/ppxb/miyabi/internal/library"
)

// The Emby server API lets third-party players such as Infuse, SenPlayer,
// VidHub or Fileball browse and play the library as if it were an Emby
// server. Players sign in with any user name and the access password, and
// videos are redirected to 115 like STRM files.

const (
	embyServerName = "115-JAV"
	embyVersion    = "4.8.11.0"
	embyServerID   = "1150e5b1a7c94d6e8f2b3c4d5e6f7a80"
	embyUserID     = "1150e5b1a7c94d6e8f2b3c4d5e6f7a81"
	ticksPerSecond = 10_000_000
)

// EmbyLibrary is the part of the library Emby players read and update.
type EmbyLibrary interface {
	SearchMovies(context.Context, lib.MovieFilter) (lib.Page, error)
	Facets(context.Context) (lib.Facets, error)
	Collections(context.Context) ([]lib.Collection, error)
	CreateCollection(context.Context, string) (lib.Collection, error)
	AddToCollection(context.Context, int, int) error
	RemoveFromCollection(context.Context, int, int) error
	CollectionMovieIDs(context.Context, int) ([]int, error)
	PlayInfo(context.Context, int) (lib.PlayInfo, error)
	SaveProgress(context.Context, int, lib.Progress) error
	ContinueWatching(context.Context) ([]lib.ContinueItem, error)
	PlayStates(context.Context) (map[int]lib.Progress, error)
	MarkPlayed(context.Context, int, bool) error
}

// SubtitleSource reads a saved subtitle in its own format.
type SubtitleSource interface {
	Source(context.Context, int, int) (string, string, error)
}

// MediaFetcher downloads remote artwork.
type MediaFetcher interface {
	Media(context.Context, string) (domain.Media, error)
}

type embyServer struct {
	gate      AccessGate
	library   EmbyLibrary
	relay     STRMRelay
	subtitles SubtitleSource
	artwork   ArtworkReader
	images    MediaFetcher
	avatars   AvatarSource
	limiter   *loginRateLimiter
	routes    []embyRoute

	// names maps person, genre and studio IDs back to their names.
	names  sync.Map
	mu     sync.Mutex
	facets lib.Facets
	expiry time.Time
}

type embyRoute struct {
	methods []string
	pattern []string
	public  bool
	handle  func(*embyServer, *embyRequest)
}

type embyRequest struct {
	*gin.Context
	params map[string]string
	query  url.Values
}

func (r *embyRequest) param(name string) string { return r.params[name] }

// q reads a query parameter regardless of its case, as players differ.
func (r *embyRequest) q(name string) string { return r.query.Get(strings.ToLower(name)) }

func (r *embyRequest) qInt(name string, fallback int) int {
	if value, err := strconv.Atoi(r.q(name)); err == nil {
		return value
	}
	return fallback
}

func (r *embyRequest) qList(name string) []string {
	var values []string
	for _, value := range strings.FieldsFunc(r.q(name), func(r rune) bool { return r == ',' || r == '|' }) {
		if value = strings.TrimSpace(value); value != "" {
			values = append(values, value)
		}
	}
	return values
}

func (r *embyRequest) ctx() context.Context { return r.Request.Context() }

func (r *embyRequest) noContent() { r.Status(http.StatusNoContent) }

// body decodes a JSON body, falling back to form values, with keys in lower case.
func (r *embyRequest) body() map[string]any {
	values := map[string]any{}
	raw, _ := io.ReadAll(io.LimitReader(r.Request.Body, 1<<20))
	var decoded map[string]any
	if json.Unmarshal(raw, &decoded) == nil {
		for key, value := range decoded {
			values[strings.ToLower(key)] = value
		}
		return values
	}
	if form, err := url.ParseQuery(string(raw)); err == nil {
		for key := range form {
			values[strings.ToLower(key)] = form.Get(key)
		}
	}
	return values
}

func newEmbyServer(deps Dependencies, limiter *loginRateLimiter) *embyServer {
	server := &embyServer{
		gate: deps.Access, library: deps.EmbyLibrary, relay: deps.STRM, subtitles: deps.EmbySubtitles,
		artwork: deps.Artwork, images: deps.Catalogue, avatars: deps.Avatars, limiter: limiter,
	}
	add := func(spec string, public bool, handle func(*embyServer, *embyRequest)) {
		methods, pattern, _ := strings.Cut(spec, " ")
		server.routes = append(server.routes, embyRoute{
			methods: strings.Split(methods, ","), pattern: strings.Split(pattern, "/"), public: public, handle: handle,
		})
	}
	open := func(spec string, handle func(*embyServer, *embyRequest)) { add(spec, true, handle) }
	auth := func(spec string, handle func(*embyServer, *embyRequest)) { add(spec, false, handle) }

	open("GET system/info/public", (*embyServer).publicInfo)
	open("GET,POST system/ping", func(_ *embyServer, r *embyRequest) { r.String(http.StatusOK, "Emby Server") })
	open("GET users/public", func(s *embyServer, r *embyRequest) { r.JSON(http.StatusOK, []any{s.user()}) })
	open("POST users/authenticatebyname", (*embyServer).authenticate)
	open("GET branding/configuration", func(_ *embyServer, r *embyRequest) {
		r.JSON(http.StatusOK, gin.H{"LoginDisclaimer": "", "CustomCss": ""})
	})
	open("GET branding/css", func(_ *embyServer, r *embyRequest) { r.Data(http.StatusOK, "text/css", nil) })
	open("GET branding/css.css", func(_ *embyServer, r *embyRequest) { r.Data(http.StatusOK, "text/css", nil) })
	// Emby serves images without a token, and players request them that way.
	for prefix, named := range map[string]string{"items": "", "persons": "person", "genres": "genre", "studios": "studio"} {
		open("GET,HEAD "+prefix+"/{id}/images/{type}", embyImage(named))
		open("GET,HEAD "+prefix+"/{id}/images/{type}/{index}", embyImage(named))
	}

	auth("GET system/info", (*embyServer).systemInfo)
	auth("GET system/endpoint", func(_ *embyServer, r *embyRequest) {
		r.JSON(http.StatusOK, gin.H{"IsLocal": true, "IsInNetwork": true})
	})
	auth("POST sessions/logout", func(_ *embyServer, r *embyRequest) { r.noContent() })
	auth("GET users/me", func(s *embyServer, r *embyRequest) { r.JSON(http.StatusOK, s.user()) })
	auth("GET users/{uid}", func(s *embyServer, r *embyRequest) { r.JSON(http.StatusOK, s.user()) })
	auth("GET users/{uid}/views", (*embyServer).views)
	auth("GET library/mediafolders", (*embyServer).views)
	auth("GET library/virtualfolders", (*embyServer).virtualFolders)
	auth("GET users/{uid}/groupingoptions", func(_ *embyServer, r *embyRequest) { r.JSON(http.StatusOK, []any{}) })
	auth("GET users/{uid}/items/root", func(s *embyServer, r *embyRequest) { r.JSON(http.StatusOK, s.rootFolder()) })
	// Fixed paths come before the {id} patterns they would otherwise match.
	auth("GET items/counts", (*embyServer).counts)
	auth("GET items/filters", (*embyServer).filters)
	auth("GET items/filters2", (*embyServer).filters2)
	for _, prefix := range []string{"users/{uid}/items", "items"} {
		auth("GET "+prefix, (*embyServer).items)
		auth("GET "+prefix+"/latest", (*embyServer).latest)
		auth("GET "+prefix+"/resume", (*embyServer).resume)
		auth("GET "+prefix+"/{id}", (*embyServer).item)
		auth("GET "+prefix+"/{id}/intros", emptyResult)
		auth("GET "+prefix+"/{id}/localtrailers", emptyList)
		auth("GET "+prefix+"/{id}/specialfeatures", emptyList)
	}
	auth("GET items/{id}/similar", (*embyServer).similar)
	auth("GET movies/{id}/similar", (*embyServer).similar)
	auth("GET items/{id}/thememedia", func(_ *embyServer, r *embyRequest) {
		empty := gin.H{"Items": []any{}, "TotalRecordCount": 0}
		r.JSON(http.StatusOK, gin.H{"ThemeVideosResult": empty, "ThemeSongsResult": empty, "SoundtrackSongsResult": empty})
	})
	auth("GET items/{id}/ancestors", func(s *embyServer, r *embyRequest) { r.JSON(http.StatusOK, []any{s.rootFolder()}) })
	auth("GET search/hints", (*embyServer).searchHints)
	auth("GET persons", (*embyServer).persons)
	auth("GET artists", emptyResult)
	auth("GET persons/{name}", embyNamedItem("person"))
	auth("GET genres", (*embyServer).genres)
	auth("GET genres/{name}", embyNamedItem("genre"))
	auth("GET studios", (*embyServer).studios)
	auth("GET studios/{name}", embyNamedItem("studio"))
	auth("GET years", (*embyServer).years)
	auth("GET shows/nextup", emptyResult)
	auth("GET shows/upcoming", emptyResult)
	auth("GET movies/recommendations", emptyList)
	auth("GET livetv/channels", emptyResult)
	auth("GET plugins", emptyList)
	auth("GET sessions", emptyList)
	auth("GET displaypreferences/{id}", (*embyServer).displayPreferences)
	auth("POST displaypreferences/{id}", func(_ *embyServer, r *embyRequest) { r.noContent() })

	auth("GET,POST items/{id}/playbackinfo", (*embyServer).playbackInfo)
	auth("GET,HEAD videos/{id}/{file}", (*embyServer).stream)
	auth("GET,HEAD items/{id}/download", (*embyServer).stream)
	auth("GET,HEAD items/{id}/file", (*embyServer).stream)
	for _, prefix := range []string{"videos", "items"} {
		auth("GET "+prefix+"/{id}/{source}/subtitles/{index}/{file}", (*embyServer).subtitle)
		auth("GET "+prefix+"/{id}/{source}/subtitles/{index}/{ticks}/{file}", (*embyServer).subtitle)
	}
	auth("POST sessions/playing", embyReport(false))
	auth("POST sessions/playing/progress", embyReport(false))
	auth("POST sessions/playing/stopped", embyReport(true))
	auth("POST sessions/playing/ping", func(_ *embyServer, r *embyRequest) { r.noContent() })
	auth("POST sessions/capabilities", func(_ *embyServer, r *embyRequest) { r.noContent() })
	auth("POST sessions/capabilities/full", func(_ *embyServer, r *embyRequest) { r.noContent() })
	auth("POST users/{uid}/playingitems/{id}", embyReport(false))
	auth("POST users/{uid}/playingitems/{id}/progress", embyReport(false))
	auth("DELETE users/{uid}/playingitems/{id}", embyReport(true))
	auth("POST users/{uid}/playeditems/{id}", embySetPlayed(true))
	auth("DELETE users/{uid}/playeditems/{id}", embySetPlayed(false))
	auth("POST users/{uid}/favoriteitems/{id}", embySetFavorite(true))
	auth("DELETE users/{uid}/favoriteitems/{id}", embySetFavorite(false))
	auth("POST users/{uid}/items/{id}/userdata", (*embyServer).updateUserData)
	auth("POST,DELETE users/{uid}/items/{id}/rating", (*embyServer).userDataOf)
	return server
}

func emptyList(_ *embyServer, r *embyRequest) { r.JSON(http.StatusOK, []any{}) }

func emptyResult(_ *embyServer, r *embyRequest) {
	r.JSON(http.StatusOK, gin.H{"Items": []any{}, "TotalRecordCount": 0, "StartIndex": 0})
}

// embySegments are the top-level Emby paths served without the /emby prefix.
// The web app's own pages (library, search, collections, movie, play) are
// left alone.
var embySegments = map[string]bool{
	"system": true, "users": true, "items": true, "videos": true, "sessions": true, "persons": true,
	"genres": true, "studios": true, "shows": true, "displaypreferences": true, "branding": true,
	"artists": true, "years": true, "movies": true, "livetv": true, "plugins": true, "embywebsocket": true,
}

// embyPath returns the path below the Emby API root, if path is one.
func embyPath(path string) ([]string, bool) {
	segments := strings.Split(strings.Trim(path, "/"), "/")
	first := strings.ToLower(segments[0])
	switch {
	case first == "emby" || first == "mediabrowser":
		return segments[1:], true
	case embySegments[first]:
		return segments, true
	case first == "library" && len(segments) == 2:
		second := strings.ToLower(segments[1])
		return segments, second == "mediafolders" || second == "virtualfolders"
	case first == "search" && len(segments) == 2:
		return segments, strings.EqualFold(segments[1], "hints")
	}
	return nil, false
}

// middleware answers Emby API requests before the web routes see them.
func (s *embyServer) middleware(c *gin.Context) {
	segments, ok := embyPath(c.Request.URL.Path)
	if !ok {
		c.Next()
		return
	}
	c.Abort()
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Headers", "*")
	c.Header("Access-Control-Allow-Methods", "GET, POST, DELETE, HEAD, OPTIONS")
	c.Header("Cache-Control", "no-store")
	if c.Request.Method == http.MethodOptions {
		c.Status(http.StatusNoContent)
		return
	}
	request := &embyRequest{Context: c, query: embyQuery(c.Request.URL.Query())}
	for _, route := range s.routes {
		params, ok := route.match(c.Request.Method, segments)
		if !ok {
			continue
		}
		if !route.public && !s.authorized(c, request) {
			c.String(http.StatusUnauthorized, "Access token is invalid or expired.")
			return
		}
		request.params = params
		route.handle(s, request)
		return
	}
	c.Status(http.StatusNotFound)
}

// embyQuery keys query parameters by their lower case name.
func embyQuery(values url.Values) url.Values {
	query := url.Values{}
	for key, value := range values {
		query[strings.ToLower(key)] = append(query[strings.ToLower(key)], value...)
	}
	return query
}

func (route embyRoute) match(method string, segments []string) (map[string]string, bool) {
	if len(route.pattern) != len(segments) {
		return nil, false
	}
	allowed := false
	for _, candidate := range route.methods {
		allowed = allowed || candidate == method
	}
	if !allowed {
		return nil, false
	}
	params := map[string]string{}
	for i, part := range route.pattern {
		if strings.HasPrefix(part, "{") {
			params[part[1:len(part)-1]] = segments[i]
		} else if part != strings.ToLower(segments[i]) {
			return nil, false
		}
	}
	return params, true
}

var embyTokenPattern = regexp.MustCompile(`(?i)\btoken="?([^",\s]+)`)

// authorized accepts the media token from any of the places Emby clients put it.
func (s *embyServer) authorized(c *gin.Context, r *embyRequest) bool {
	if !s.gate.Enabled() {
		return true
	}
	candidates := []string{
		c.GetHeader("X-Emby-Token"), c.GetHeader("X-MediaBrowser-Token"),
		r.q("api_key"), r.q("x-emby-token"), r.q("apikey"), r.q("accesstoken"),
	}
	for _, header := range []string{"X-Emby-Authorization", "Authorization"} {
		if match := embyTokenPattern.FindStringSubmatch(c.GetHeader(header)); match != nil {
			candidates = append(candidates, match[1])
		}
	}
	expected := []byte(s.gate.MediaToken())
	for _, candidate := range candidates {
		if candidate != "" && subtle.ConstantTimeCompare([]byte(candidate), expected) == 1 {
			return true
		}
	}
	return false
}

func (s *embyServer) token() string {
	if token := s.gate.MediaToken(); token != "" {
		return token
	}
	return "115jav"
}

func (s *embyServer) authenticate(r *embyRequest) {
	ip := r.ClientIP()
	attempt, err := s.limiter.begin(ip)
	if err != nil {
		r.String(http.StatusTooManyRequests, "Too many login attempts.")
		return
	}
	result := loginNotVerified
	defer func() { s.limiter.finish(ip, attempt, result) }()

	body := r.body()
	password, _ := body["pw"].(string)
	if password == "" {
		password, _ = body["password"].(string)
	}
	if err := s.gate.Verify(password); err != nil {
		result = loginFailed
		r.String(http.StatusUnauthorized, "Invalid user name or password.")
		return
	}
	result = loginSucceeded
	client, device, deviceID := "", "", ""
	if header := r.GetHeader("X-Emby-Authorization") + r.GetHeader("Authorization"); header != "" {
		client, device, deviceID = authField(header, "Client"), authField(header, "Device"), authField(header, "DeviceId")
	}
	r.JSON(http.StatusOK, gin.H{
		"User": s.user(),
		"SessionInfo": gin.H{
			"Id": deviceID, "UserId": embyUserID, "UserName": embyServerName, "ServerId": embyServerID,
			"Client": client, "DeviceName": device, "DeviceId": deviceID, "ApplicationVersion": embyVersion,
			"PlayableMediaTypes": []string{"Video"}, "SupportedCommands": []string{},
		},
		"AccessToken": s.token(),
		"ServerId":    embyServerID,
	})
}

func authField(header, name string) string {
	match := regexp.MustCompile(`(?i)\b` + name + `="([^"]*)"`).FindStringSubmatch(header)
	if match == nil {
		return ""
	}
	value, _ := url.QueryUnescape(match[1])
	return value
}

func (s *embyServer) user() gin.H {
	return gin.H{
		"Name": embyServerName, "ServerId": embyServerID, "Id": embyUserID,
		"HasPassword": s.gate.Enabled(), "HasConfiguredPassword": s.gate.Enabled(),
		"HasConfiguredEasyPassword": false, "EnableAutoLogin": false,
		"Configuration": gin.H{
			"PlayDefaultAudioTrack": true, "SubtitleMode": "Default", "DisplayMissingEpisodes": false,
			"OrderedViews": []string{}, "LatestItemsExcludes": []string{}, "MyMediaExcludes": []string{},
			"HidePlayedInLatest": false, "RememberAudioSelections": true, "RememberSubtitleSelections": true,
			"EnableNextEpisodeAutoPlay": true, "AudioLanguagePreference": "", "SubtitleLanguagePreference": "",
		},
		"Policy": gin.H{
			"IsAdministrator": false, "IsHidden": false, "IsDisabled": false,
			"EnableUserPreferenceAccess": true, "EnableRemoteAccess": true, "EnableMediaPlayback": true,
			"EnableAudioPlaybackTranscoding": false, "EnableVideoPlaybackTranscoding": false,
			"EnablePlaybackRemuxing": false, "EnableContentDownloading": true, "EnableContentDeletion": false,
			"EnableAllFolders": true, "EnableAllDevices": true, "EnableAllChannels": true,
			"EnabledFolders": []string{}, "BlockedTags": []string{}, "AccessSchedules": []any{},
			"BlockUnratedItems": []string{}, "EnableLiveTvAccess": false, "EnableLiveTvManagement": false,
			"EnableSharedDeviceControl": true, "EnableRemoteControlOfOtherUsers": false,
			"SimultaneousStreamLimit": 0, "RemoteClientBitrateLimit": 0, "InvalidLoginAttemptCount": 0,
			"AuthenticationProviderId": "Emby.Server.Implementations.Library.DefaultAuthenticationProvider",
		},
	}
}

func (s *embyServer) address(r *embyRequest) string {
	scheme := "http"
	if r.Request.TLS != nil || strings.EqualFold(r.GetHeader("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Request.Host
}

func (s *embyServer) publicInfo(r *embyRequest) {
	r.JSON(http.StatusOK, gin.H{
		"LocalAddress": s.address(r), "ServerName": embyServerName, "Version": embyVersion,
		"ProductName": "Emby Server", "OperatingSystem": "Linux", "Id": embyServerID,
		"StartupWizardCompleted": true,
	})
}

func (s *embyServer) systemInfo(r *embyRequest) {
	address := s.address(r)
	r.JSON(http.StatusOK, gin.H{
		"LocalAddress": address, "LocalAddresses": []string{address}, "RemoteAddresses": []string{},
		"WanAddress": address, "ServerName": embyServerName, "Version": embyVersion,
		"ProductName": "Emby Server", "OperatingSystem": "Linux", "OperatingSystemDisplayName": "Linux",
		"Id": embyServerID, "StartupWizardCompleted": true, "HasPendingRestart": false, "IsShuttingDown": false,
		"SupportsLibraryMonitor": false, "CanSelfRestart": false, "CanSelfUpdate": false,
		"CanLaunchWebBrowser": false, "HasUpdateAvailable": false, "SupportsAutoRunAtStartup": false,
		"HardwareAccelerationRequiresPremiere": false, "SystemUpdateLevel": "Release",
	})
}

func (s *embyServer) displayPreferences(r *embyRequest) {
	r.JSON(http.StatusOK, gin.H{
		"Id": r.param("id"), "SortBy": "SortName", "SortOrder": "Ascending", "RememberIndexing": false,
		"RememberSorting": false, "PrimaryImageHeight": 250, "PrimaryImageWidth": 250,
		"CustomPrefs": gin.H{}, "ScrollDirection": "Horizontal", "ShowBackdrop": true, "ShowSidebar": false,
		"Client": r.q("client"),
	})
}

// facetsCached shares the library facets between the many requests of a
// browsing player.
func (s *embyServer) facetsCached(ctx context.Context) (lib.Facets, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Now().Before(s.expiry) {
		return s.facets, nil
	}
	facets, err := s.library.Facets(ctx)
	if err != nil {
		return lib.Facets{}, err
	}
	s.facets, s.expiry = facets, time.Now().Add(5*time.Minute)
	return facets, nil
}

// fail answers an error the way the rest of the API does.
func (r *embyRequest) fail(err error) {
	status, _ := mapErrorStatus(err)
	r.String(status, domain.PublicMessage(err))
}

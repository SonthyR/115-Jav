package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	lib "github.com/ppxb/miyabi/internal/library"
)

type embyLibraryStub struct {
	movies      []lib.Movie
	files       map[int][]lib.PlayFile
	subtitles   []lib.PlaySubtitle
	states      map[int]lib.Progress
	collections []lib.Collection
	members     map[int][]int
	filters     []lib.MovieFilter
	played      map[int]bool
}

func newEmbyLibraryStub() *embyLibraryStub {
	poster, cover := "/api/library/artwork/"+strings.Repeat("a", 64), "https://example.com/cover.jpg"
	return &embyLibraryStub{
		movies: []lib.Movie{
			{ID: 1, Code: "ABP-001", Title: "ABP-001 First", Poster: &poster, Cover: &cover, Duration: 100, Rating: 4.5,
				ReleaseDate: "2024-05-01", Actors: []lib.Entity{{Name: "Actor A"}}, Tags: []lib.Tag{{Name: "Drama"}}},
			{ID: 2, Code: "ABP-002", Title: "ABP-002 Second", Duration: 120, Actors: []lib.Entity{{Name: "Actor A"}}},
			{ID: 3, Code: "ABP-003", Title: "ABP-003 Third", Duration: 90},
		},
		files: map[int][]lib.PlayFile{
			1: {{FileID: "f1", Name: "ABP-001.mkv", Size: 10}, {FileID: "f1c", Name: "ABP-001-C.mp4", Size: 11}},
			2: {{FileID: "f2", Name: "ABP-002.mp4"}},
		},
		subtitles: []lib.PlaySubtitle{{ID: 9, Name: "ABP-001.zh-CN.ass", Language: "zh-CN", Format: "ass"}},
		states:    map[int]lib.Progress{},
		members:   map[int][]int{},
		played:    map[int]bool{},
	}
}

func (s *embyLibraryStub) SearchMovies(_ context.Context, filter lib.MovieFilter) (lib.Page, error) {
	s.filters = append(s.filters, filter)
	var movies []lib.Movie
	for _, movie := range s.movies {
		if filter.IDs != nil && !slices.Contains(filter.IDs, movie.ID) || slices.Contains(filter.ExcludeIDs, movie.ID) {
			continue
		}
		if filter.Actor != "" && !slices.ContainsFunc(movie.Actors, func(e lib.Entity) bool { return e.Name == filter.Actor }) {
			continue
		}
		if filter.Collection > 0 && !slices.Contains(s.members[filter.Collection], movie.ID) {
			continue
		}
		movies = append(movies, movie)
	}
	if filter.Reverse {
		slices.Reverse(movies)
	}
	total := len(movies)
	movies = movies[min(filter.Offset, total):]
	return lib.Page{Movies: movies[:min(filter.Limit, len(movies))], Total: total, Page: 1}, nil
}

func (s *embyLibraryStub) Facets(context.Context) (lib.Facets, error) {
	return lib.Facets{Actors: []lib.Facet{{Name: "Actor A", Count: 2}}, Tags: []lib.Facet{{Name: "Drama", Count: 1}}}, nil
}

func (s *embyLibraryStub) Collections(context.Context) ([]lib.Collection, error) {
	return s.collections, nil
}

func (s *embyLibraryStub) CreateCollection(_ context.Context, name string) (lib.Collection, error) {
	collection := lib.Collection{ID: len(s.collections) + 1, Name: name}
	s.collections = append(s.collections, collection)
	return collection, nil
}

func (s *embyLibraryStub) AddToCollection(_ context.Context, id, movieID int) error {
	s.members[id] = append(s.members[id], movieID)
	return nil
}

func (s *embyLibraryStub) RemoveFromCollection(_ context.Context, id, movieID int) error {
	s.members[id] = slices.DeleteFunc(s.members[id], func(member int) bool { return member == movieID })
	return nil
}

func (s *embyLibraryStub) CollectionMovieIDs(_ context.Context, id int) ([]int, error) {
	return s.members[id], nil
}

func (s *embyLibraryStub) PlayInfo(_ context.Context, id int) (lib.PlayInfo, error) {
	info := lib.PlayInfo{Files: s.files[id], Subtitles: []lib.PlaySubtitle{}}
	if id == 1 {
		info.Subtitles = s.subtitles
	}
	return info, nil
}

func (s *embyLibraryStub) SaveProgress(_ context.Context, id int, progress lib.Progress) error {
	s.states[id] = progress
	return nil
}

func (s *embyLibraryStub) ContinueWatching(context.Context) ([]lib.ContinueItem, error) {
	var items []lib.ContinueItem
	for id, progress := range s.states {
		if progress.Position > 0 {
			items = append(items, lib.ContinueItem{Movie: lib.Movie{ID: id}, Progress: progress})
		}
	}
	return items, nil
}

func (s *embyLibraryStub) PlayStates(context.Context) (map[int]lib.Progress, error) {
	return s.states, nil
}

func (s *embyLibraryStub) MarkPlayed(_ context.Context, id int, played bool) error {
	s.played[id] = played
	if played {
		s.states[id] = lib.Progress{FileID: "f1", Played: true}
	} else {
		delete(s.states, id)
	}
	return nil
}

type embySubtitleStub struct{}

func (embySubtitleStub) Source(context.Context, int, int) (string, string, error) {
	return "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
		"Dialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,你好\n", "ass", nil
}

type embyAvatarStub struct{}

func (embyAvatarStub) CachedAvatar(_ context.Context, name string) ([]byte, error) {
	return []byte("\x89PNG\r\n\x1a\n" + name), nil
}

type embyArtworkStub struct{}

func (embyArtworkStub) Artwork(string) ([]byte, error) { return []byte("\xff\xd8\xff\xe0poster"), nil }

func (stub embyArtworkStub) SizedArtwork(key string, _ int) ([]byte, error) { return stub.Artwork(key) }

type embyTestServer struct {
	router  *gin.Engine
	library *embyLibraryStub
	relay   *strmRelayStub
	token   string
}

func newEmbyTestServer(t *testing.T, password string) *embyTestServer {
	t.Helper()
	library := newEmbyLibraryStub()
	relay := &strmRelayStub{streamURL: "https://cdn.115.com/ABP-001.mkv?sign=1"}
	gate := NewAccessGateService(password, "")
	router := NewRouter(Dependencies{
		Access: gate, STRM: relay, EmbyLibrary: library, EmbySubtitles: embySubtitleStub{},
		Artwork: embyArtworkStub{}, Avatars: embyAvatarStub{},
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	return &embyTestServer{router: router, library: library, relay: relay, token: gate.MediaToken()}
}

func (s *embyTestServer) do(t *testing.T, method, target, body string, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	for i := 0; i+1 < len(headers); i += 2 {
		request.Header.Set(headers[i], headers[i+1])
	}
	recorder := httptest.NewRecorder()
	s.router.ServeHTTP(recorder, request)
	return recorder
}

func (s *embyTestServer) get(t *testing.T, target string, into any) {
	t.Helper()
	response := s.do(t, http.MethodGet, target, "", "X-Emby-Token", s.token)
	if response.Code != http.StatusOK {
		t.Fatalf("GET %s: status %d body %s", target, response.Code, response.Body.String())
	}
	if err := json.Unmarshal(response.Body.Bytes(), into); err != nil {
		t.Fatalf("GET %s: %v in %s", target, err, response.Body.String())
	}
}

type embyItemsBody struct {
	Items            []embyItem
	TotalRecordCount int
}

func TestEmbyPlayersSignInWithTheAccessPassword(t *testing.T) {
	server := newEmbyTestServer(t, "secret")
	for _, path := range []string{"/System/Info/Public", "/emby/system/info/public", "/mediabrowser/System/Info/Public"} {
		if response := server.do(t, http.MethodGet, path, ""); response.Code != http.StatusOK ||
			!strings.Contains(response.Body.String(), `"ProductName":"Emby Server"`) {
			t.Fatalf("%s: %d %s", path, response.Code, response.Body.String())
		}
	}
	authorization := `MediaBrowser Client="Infuse", Device="Apple TV", DeviceId="abc", Version="8"`
	if response := server.do(t, http.MethodPost, "/emby/Users/AuthenticateByName", `{"Username":"me","Pw":"wrong"}`,
		"X-Emby-Authorization", authorization); response.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password: %d", response.Code)
	}
	response := server.do(t, http.MethodPost, "/Users/AuthenticateByName", `{"Username":"me","Pw":"secret"}`,
		"X-Emby-Authorization", authorization)
	var login struct {
		AccessToken string
		User        struct{ Id string }
	}
	if err := json.Unmarshal(response.Body.Bytes(), &login); err != nil || login.AccessToken != server.token || login.User.Id != embyUserID {
		t.Fatalf("login: %d %s", response.Code, response.Body.String())
	}
	// Form posts work as well, as some players send them.
	request := httptest.NewRequest(http.MethodPost, "/emby/Users/AuthenticateByName", strings.NewReader("Username=me&Pw=secret"))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	recorder := httptest.NewRecorder()
	server.router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("form login: %d", recorder.Code)
	}

	path := "/emby/Users/" + embyUserID + "/Views"
	if response := server.do(t, http.MethodGet, path, ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("no token: %d", response.Code)
	}
	for _, headers := range [][]string{
		{"X-Emby-Token", login.AccessToken},
		{"X-Emby-Authorization", authorization + `, Token="` + login.AccessToken + `"`},
		{"Authorization", `MediaBrowser Token="` + login.AccessToken + `"`},
	} {
		if response := server.do(t, http.MethodGet, path, "", headers...); response.Code != http.StatusOK {
			t.Fatalf("%v: %d", headers, response.Code)
		}
	}
	if response := server.do(t, http.MethodGet, path+"?api_key="+login.AccessToken, ""); response.Code != http.StatusOK {
		t.Fatalf("api_key: %d", response.Code)
	}
}

func TestEmbyPathsLeaveTheWebAppAlone(t *testing.T) {
	for path, emby := range map[string]bool{
		"/Items": true, "/emby/anything": true, "/Library/VirtualFolders": true, "/Search/Hints": true,
		"/library": false, "/search": false, "/collections/3": false, "/movie/1": false, "/play/1": false,
		"/api/library/movies": false,
	} {
		if _, ok := embyPath(path); ok != emby {
			t.Errorf("%s: emby=%v", path, ok)
		}
	}
}

func TestEmbyListsTheLibraryAsMovies(t *testing.T) {
	server := newEmbyTestServer(t, "secret")
	var views embyItemsBody
	server.get(t, "/emby/Users/"+embyUserID+"/Views", &views)
	if len(views.Items) != 2 || views.Items[0].CollectionType != "movies" || views.Items[0].ChildCount != 3 {
		t.Fatalf("views: %+v", views)
	}

	var page embyItemsBody
	server.get(t, "/emby/Users/u/Items?ParentId="+views.Items[0].Id+"&Recursive=true&IncludeItemTypes=Movie"+
		"&SortBy=SortName&SortOrder=Descending&StartIndex=1&Limit=1&Fields=Overview", &page)
	if page.TotalRecordCount != 3 || len(page.Items) != 1 || page.Items[0].Id != "2" {
		t.Fatalf("page: %+v", page)
	}
	filter := server.library.filters[len(server.library.filters)-1]
	if filter.Sort != "code" || !filter.Reverse || filter.Offset != 1 || filter.Limit != 1 {
		t.Fatalf("filter: %+v", filter)
	}

	var counts struct{ MovieCount int }
	server.get(t, "/emby/Items/Counts", &counts)
	if counts.MovieCount != 3 {
		t.Fatalf("counts: %+v", counts)
	}
	server.get(t, "/Users/u/Items?Recursive=true&IncludeItemTypes=Movie&SortBy=IsFolder,DateCreated&SortOrder=Ascending", &page)
	if filter := server.library.filters[len(server.library.filters)-1]; filter.Sort != "added" || !filter.Reverse {
		t.Fatalf("sort: %+v", filter)
	}

	server.get(t, "/emby/Users/u/Items?Recursive=true&IncludeItemTypes=Series", &page)
	if page.TotalRecordCount != 0 || len(page.Items) != 0 {
		t.Fatalf("series must be empty: %+v", page)
	}

	var movie embyItem
	server.get(t, "/emby/Users/u/Items/1", &movie)
	if movie.Type != "Movie" || movie.Name != "ABP-001 First" || movie.ProductionYear != 2024 || movie.CommunityRating != 9 ||
		len(movie.MediaSources) != 2 || movie.ImageTags["Primary"] == "" || len(movie.People) != 1 || len(movie.GenreItems) != 1 {
		t.Fatalf("movie: %+v", movie)
	}
	source := movie.MediaSources[0]
	if source.Id != "f1" || source.Container != "mkv" || !source.SupportsDirectPlay ||
		!strings.Contains(source.DirectStreamUrl, "MediaSourceId=f1") || !strings.Contains(source.DirectStreamUrl, "api_key="+server.token) {
		t.Fatalf("source: %+v", source)
	}
	if len(source.MediaStreams) != 2 || source.MediaStreams[1].Codec != "ass" || source.MediaStreams[1].Language != "chi" {
		t.Fatalf("streams: %+v", source.MediaStreams)
	}

	var byActor embyItemsBody
	server.get(t, "/emby/Items?Recursive=true&IncludeItemTypes=Movie&PersonIds="+movie.People[0].Id, &byActor)
	if byActor.TotalRecordCount != 2 {
		t.Fatalf("by actor: %+v", byActor)
	}
}

func TestEmbyStreamsRedirectTo115(t *testing.T) {
	server := newEmbyTestServer(t, "secret")
	response := server.do(t, http.MethodGet, "/emby/videos/1/stream.mp4?mediaSourceId=f1c&static=true&api_key="+server.token, "",
		"User-Agent", "Infuse")
	if response.Code != http.StatusFound || response.Header().Get("Location") != server.relay.streamURL {
		t.Fatalf("stream: %d %v", response.Code, response.Header())
	}
	if response := server.do(t, http.MethodGet, "/Videos/1/stream?static=true", ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("stream without token: %d", response.Code)
	}

	subtitle := server.do(t, http.MethodGet, "/Videos/1/f1/Subtitles/1/0/Stream.srt?api_key="+server.token, "")
	if subtitle.Code != http.StatusOK || !strings.Contains(subtitle.Body.String(), "1\n00:00:01,500 --> 00:00:03,000\n你好") {
		t.Fatalf("srt: %d %q", subtitle.Code, subtitle.Body.String())
	}
	raw := server.do(t, http.MethodGet, "/Videos/1/f1/Subtitles/1/Stream.ass?api_key="+server.token, "")
	if !strings.Contains(raw.Body.String(), "Dialogue:") {
		t.Fatalf("ass: %q", raw.Body.String())
	}

	// Images need no token, as on Emby.
	if image := server.do(t, http.MethodGet, "/emby/Items/1/Images/Primary?maxHeight=400&tag=x", ""); image.Code != http.StatusOK ||
		image.Body.String() != "\xff\xd8\xff\xe0poster" {
		t.Fatalf("image: %d", image.Code)
	}
	var movie embyItem
	server.get(t, "/emby/Users/u/Items/1", &movie)
	if portrait := server.do(t, http.MethodGet, "/emby/Items/"+movie.People[0].Id+"/Images/Primary", ""); portrait.Code != http.StatusOK ||
		!strings.HasSuffix(portrait.Body.String(), "Actor A") {
		t.Fatalf("portrait: %d", portrait.Code)
	}
}

func TestEmbyPlaybackReportsKeepProgressAndPlayedState(t *testing.T) {
	server := newEmbyTestServer(t, "secret")
	report := func(path, body string) {
		t.Helper()
		if response := server.do(t, http.MethodPost, path, body, "X-Emby-Token", server.token); response.Code != http.StatusNoContent {
			t.Fatalf("%s: %d %s", path, response.Code, response.Body.String())
		}
	}
	// 30 minutes of 100.
	report("/emby/Sessions/Playing/Progress", `{"ItemId":"1","MediaSourceId":"f1c","PositionTicks":18000000000}`)
	if progress := server.library.states[1]; progress.FileID != "f1c" || progress.Position != 1800 {
		t.Fatalf("progress: %+v", progress)
	}
	var resume embyItemsBody
	server.get(t, "/emby/Users/u/Items/Resume?Limit=12&MediaTypes=Video", &resume)
	if len(resume.Items) != 1 || resume.Items[0].UserData.PlaybackPositionTicks != 18000000000 {
		t.Fatalf("resume: %+v", resume)
	}
	// Stopping near the end marks the movie played.
	report("/emby/Sessions/Playing/Stopped", `{"ItemId":"1","PositionTicks":57000000000}`)
	if !server.library.played[1] {
		t.Fatal("movie not played")
	}
	report("/emby/Users/u/PlayingItems/2/Progress?PositionTicks=600000000&MediaSourceId=f2", "")
	if progress := server.library.states[2]; progress.Position != 60 || progress.FileID != "f2" {
		t.Fatalf("legacy progress: %+v", progress)
	}

	if response := server.do(t, http.MethodPost, "/emby/Users/u/FavoriteItems/2", "", "X-Emby-Token", server.token); response.Code != http.StatusOK ||
		!strings.Contains(response.Body.String(), `"IsFavorite":true`) {
		t.Fatalf("favorite: %d %s", response.Code, response.Body.String())
	}
	if len(server.library.collections) != 1 || server.library.collections[0].Name != embyFavoritesName {
		t.Fatalf("collections: %+v", server.library.collections)
	}
	var favorites embyItemsBody
	server.get(t, "/emby/Users/u/Items?Recursive=true&IncludeItemTypes=Movie&Filters=IsFavorite", &favorites)
	if len(favorites.Items) != 1 || favorites.Items[0].Id != "2" {
		t.Fatalf("favorites: %+v", favorites)
	}
	var unplayed embyItemsBody
	server.get(t, "/emby/Users/u/Items?Recursive=true&IncludeItemTypes=Movie&Filters=IsUnplayed", &unplayed)
	if unplayed.TotalRecordCount != 2 {
		t.Fatalf("unplayed: %+v", unplayed)
	}
	if response := server.do(t, http.MethodDelete, "/emby/Users/u/PlayedItems/1", "", "X-Emby-Token", server.token); response.Code != http.StatusOK ||
		server.library.played[1] {
		t.Fatalf("unplay: %d", response.Code)
	}
}

func TestEmbyOpenAccessNeedsNoToken(t *testing.T) {
	server := newEmbyTestServer(t, "")
	if response := server.do(t, http.MethodGet, "/Users/x/Items?Recursive=true", ""); response.Code != http.StatusOK {
		t.Fatalf("open items: %d", response.Code)
	}
	response := server.do(t, http.MethodPost, "/Users/AuthenticateByName", `{"Username":"x","Pw":""}`)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"AccessToken":"115jav"`) {
		t.Fatalf("open login: %d %s", response.Code, response.Body.String())
	}
}

func TestLiteServersReportLiteAndServeNoEmbyAPI(t *testing.T) {
	router := NewRouter(Dependencies{
		Access: NewAccessGateService("", ""), Lite: true,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/auth/config", nil))
	if !strings.Contains(response.Body.String(), `"lite":true`) {
		t.Fatalf("config: %s", response.Body.String())
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/emby/System/Info/Public", nil))
	if strings.Contains(response.Body.String(), "Emby Server") {
		t.Fatalf("emby answered: %d %s", response.Code, response.Body.String())
	}
}

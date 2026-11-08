package api

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
)

// embyStep is one request a player makes; {uid}, {view}, {person} and
// {token} are filled in from the server under test.
type embyStep struct {
	method, path, body string
	headers            []string
}

type embyExchange struct {
	Request     string          `json:"request"`
	Status      int             `json:"status"`
	Location    string          `json:"location,omitempty"`
	ContentType string          `json:"content_type,omitempty"`
	Body        json.RawMessage `json:"body,omitempty"`
	Text        string          `json:"text,omitempty"`
}

// The sessions below replay what Infuse and SenPlayer ask of an Emby server,
// from sign-in to playback reports. Their full responses are frozen, so a
// change that would confuse a player shows up as a golden diff. Run with
// -update after an intentional change and check the diff against Emby.
func TestEmbyPlayerSessionsMatchGoldenFiles(t *testing.T) {
	infuse := `MediaBrowser Client="Infuse", Device="Apple TV", DeviceId="infuse-1", Version="8.0"`
	senPlayer := `MediaBrowser Client="SenPlayer", Device="iPhone", DeviceId="sen-1", Version="5.0"`
	fields := "&Fields=Overview,Genres,People,Studios,MediaSources,ProviderIds,DateCreated,UserData"
	for _, session := range []struct {
		name  string
		steps []embyStep
	}{
		{name: "infuse", steps: []embyStep{
			{method: "GET", path: "/emby/System/Info/Public"},
			{method: "POST", path: "/emby/Users/AuthenticateByName", body: `{"Username":"me","Pw":"secret"}`,
				headers: []string{"X-Emby-Authorization", infuse}},
			{method: "GET", path: "/emby/System/Info"},
			{method: "GET", path: "/emby/Users/{uid}"},
			{method: "GET", path: "/emby/Users/{uid}/Views"},
			{method: "GET", path: "/emby/Users/{uid}/Items?ParentId={view}&Recursive=true&IncludeItemTypes=Movie" +
				"&StartIndex=0&Limit=50&SortBy=SortName&SortOrder=Ascending&EnableImageTypes=Primary,Backdrop,Thumb" + fields},
			{method: "GET", path: "/emby/Users/{uid}/Items/Latest?ParentId={view}&Limit=16" + fields},
			{method: "GET", path: "/emby/Users/{uid}/Items/1?" + fields[1:]},
			{method: "POST", path: "/emby/Items/1/PlaybackInfo?UserId={uid}&StartTimeTicks=0&IsPlayback=true" +
				"&AutoOpenLiveStream=true&MaxStreamingBitrate=140000000", body: `{"DeviceProfile":{}}`},
			{method: "GET", path: "/emby/Videos/1/stream.mkv?Static=true&MediaSourceId=f1&api_key={token}",
				headers: []string{"User-Agent", "Infuse-Direct/8.0"}},
			{method: "POST", path: "/emby/Sessions/Playing", body: `{"ItemId":"1","MediaSourceId":"f1","PositionTicks":0}`},
			{method: "POST", path: "/emby/Sessions/Playing/Progress",
				body: `{"ItemId":"1","MediaSourceId":"f1","PositionTicks":300000000,"EventName":"timeupdate"}`},
			{method: "POST", path: "/emby/Sessions/Playing/Stopped", body: `{"ItemId":"1","MediaSourceId":"f1","PositionTicks":600000000}`},
			{method: "GET", path: "/emby/Users/{uid}/Items/Resume?Limit=12&MediaTypes=Video" + fields},
			{method: "POST", path: "/emby/Users/{uid}/FavoriteItems/2"},
			{method: "GET", path: "/emby/Users/{uid}/Items?Recursive=true&IncludeItemTypes=Movie&Filters=IsFavorite"},
			{method: "GET", path: "/emby/Search/Hints?SearchTerm=ABP&Limit=20&IncludeItemTypes=Movie"},
			{method: "GET", path: "/emby/Genres?ParentId={view}&Recursive=true"},
			{method: "GET", path: "/emby/Items?Recursive=true&IncludeItemTypes=Movie&PersonIds={person}"},
			{method: "GET", path: "/emby/Items/1/Images/Primary?maxHeight=600&tag=x"},
			{method: "GET", path: "/emby/Videos/1/f1/Subtitles/1/0/Stream.srt?api_key={token}"},
		}},
		{name: "senplayer", steps: []embyStep{
			{method: "GET", path: "/System/Info/Public"},
			{method: "POST", path: "/Users/AuthenticateByName", body: `{"Username":"me","Pw":"secret"}`,
				headers: []string{"Authorization", senPlayer}},
			{method: "GET", path: "/Users/{uid}/Views?X-Emby-Token={token}"},
			{method: "GET", path: "/Library/VirtualFolders"},
			{method: "GET", path: "/Users/{uid}/Items?parentId={view}&recursive=true&includeItemTypes=Movie" +
				"&startIndex=0&limit=30&sortBy=DateCreated,SortName&sortOrder=Descending" + strings.ToLower(fields)},
			{method: "GET", path: "/Items/Counts?UserId={uid}"},
			{method: "GET", path: "/Items/Filters?UserId={uid}&ParentId={view}"},
			{method: "GET", path: "/Users/{uid}/Items/2"},
			{method: "GET", path: "/Items/2/PlaybackInfo?UserId={uid}"},
			{method: "HEAD", path: "/Videos/2/stream?static=true&mediaSourceId=f2&api_key={token}"},
			{method: "POST", path: "/Users/{uid}/PlayingItems/2/Progress?PositionTicks=600000000&MediaSourceId=f2"},
			{method: "POST", path: "/Users/{uid}/PlayedItems/2"},
			{method: "GET", path: "/Users/{uid}/Items?Recursive=true&IncludeItemTypes=Movie&Filters=IsPlayed"},
			{method: "DELETE", path: "/Users/{uid}/PlayedItems/2"},
			{method: "GET", path: "/Items/1/Similar?UserId={uid}&Limit=12"},
			{method: "GET", path: "/Persons/Actor%20A?UserId={uid}"},
			{method: "POST", path: "/Sessions/Capabilities/Full", body: `{"PlayableMediaTypes":["Video"]}`},
		}},
	} {
		t.Run(session.name, func(t *testing.T) {
			server := newEmbyTestServer(t, "secret")
			var views embyItemsBody
			server.get(t, "/emby/Users/"+embyUserID+"/Views", &views)
			var movie embyItem
			server.get(t, "/emby/Users/"+embyUserID+"/Items/1", &movie)
			fill := strings.NewReplacer("{uid}", embyUserID, "{view}", views.Items[0].Id,
				"{person}", movie.People[0].Id, "{token}", server.token)

			var exchanges []embyExchange
			for _, step := range session.steps {
				headers := step.headers
				if !strings.Contains(step.path, "{token}") && !strings.Contains(step.path, "AuthenticateByName") {
					headers = append([]string{"X-Emby-Token", server.token}, headers...)
				}
				response := server.do(t, step.method, fill.Replace(step.path), step.body, headers...)
				exchange := embyExchange{
					Request: step.method + " " + step.path, Status: response.Code, Location: response.Header().Get("Location"),
					ContentType: response.Header().Get("Content-Type"),
				}
				switch body := response.Body.Bytes(); {
				case json.Valid(body):
					exchange.Body = body
				case strings.HasPrefix(exchange.ContentType, "image/"):
					exchange.Text = "image"
				default:
					exchange.Text = string(body)
				}
				exchanges = append(exchanges, exchange)
			}
			// The token is random per run; the golden files show where it goes.
			encoded, err := json.Marshal(exchanges)
			if err != nil {
				t.Fatal(err)
			}
			encoded = []byte(strings.ReplaceAll(string(encoded), server.token, "{token}"))
			assertGolden(t, filepath.Join("testdata", "golden", "emby", session.name+".json"), encoded)
		})
	}
}

func TestEmbyLeavesEveryWebPageAlone(t *testing.T) {
	for _, path := range []string{
		"/", "/browse", "/browse/actor/A", "/actors", "/collections", "/collections/1", "/movie/1", "/play/1",
		"/discover", "/discover/search", "/subscriptions", "/me", "/organize", "/library", "/settings", "/search",
		"/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon.png", "/favicon.png", "/assets/index-abc12345.js",
	} {
		if _, ok := embyPath(path); ok {
			t.Errorf("%s is taken by the Emby API", path)
		}
	}
	if response := newEmbyTestServer(t, "").do(t, http.MethodGet, "/me", ""); response.Code == http.StatusUnauthorized {
		t.Fatalf("/me answered by Emby: %d", response.Code)
	}
}

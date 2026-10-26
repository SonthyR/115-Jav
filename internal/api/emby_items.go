package api

import (
	"cmp"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"hash/fnv"
	"math/rand/v2"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ppxb/miyabi/internal/domain"
	mediaimage "github.com/ppxb/miyabi/internal/image"
	lib "github.com/ppxb/miyabi/internal/library"
)

// Emby item IDs are numbers. Movies keep their library ID; the other kinds
// live in ranges above any movie ID, and named ones hash their name.
const (
	embyRootID        = 2_000_000_000
	embyViewAll       = 2_000_000_001
	embyViewChinese   = 2_000_000_002
	embyViewBoxSets   = 2_000_000_003
	embyBoxSetBase    = 3_000_000_000
	embyPersonBase    = 10_000_000_000
	embyGenreBase     = 20_000_000_000
	embyStudioBase    = 30_000_000_000
	embyYearBase      = 40_000_000_000
	embyNameRange     = 1 << 32
	embyFavoritesName = "收藏"
	// embyAllMovies bounds a request that asks for every movie at once.
	embyAllMovies = 100_000
)

type embyRef struct {
	kind string
	id   int
	name string
}

func (s *embyServer) nameID(kind, name string) string {
	hash := fnv.New32a()
	hash.Write([]byte(name))
	base := map[string]int{"person": embyPersonBase, "genre": embyGenreBase, "studio": embyStudioBase}[kind]
	id := strconv.Itoa(base + int(hash.Sum32()))
	s.names.Store(id, name)
	return id
}

// ref decodes an item ID. Names unseen since the server started are looked
// up among the library facets.
func (s *embyServer) ref(ctx context.Context, value string) (embyRef, bool) {
	id, err := strconv.Atoi(value)
	if err != nil || id <= 0 {
		return embyRef{}, false
	}
	switch {
	case id < embyRootID:
		return embyRef{kind: "movie", id: id}, true
	case id == embyRootID:
		return embyRef{kind: "root"}, true
	case id <= embyViewBoxSets:
		return embyRef{kind: "view", id: id}, true
	case id > embyBoxSetBase && id < embyBoxSetBase+embyNameRange:
		return embyRef{kind: "boxset", id: id - embyBoxSetBase}, true
	case id >= embyYearBase && id < embyYearBase+10_000:
		return embyRef{kind: "year", id: id - embyYearBase, name: strconv.Itoa(id - embyYearBase)}, true
	}
	kind := ""
	switch {
	case id >= embyPersonBase && id < embyPersonBase+embyNameRange:
		kind = "person"
	case id >= embyGenreBase && id < embyGenreBase+embyNameRange:
		kind = "genre"
	case id >= embyStudioBase && id < embyStudioBase+embyNameRange:
		kind = "studio"
	default:
		return embyRef{}, false
	}
	if name, ok := s.names.Load(value); ok {
		return embyRef{kind: kind, name: name.(string)}, true
	}
	if facets, err := s.facetsCached(ctx); err == nil {
		for _, list := range [][]lib.Facet{facets.Actors, facets.Tags, facets.Makers} {
			for _, facet := range list {
				for _, kind := range []string{"person", "genre", "studio"} {
					s.nameID(kind, facet.Name)
				}
			}
		}
	}
	if name, ok := s.names.Load(value); ok {
		return embyRef{kind: kind, name: name.(string)}, true
	}
	return embyRef{}, false
}

type embyNameID struct {
	Name string `json:"Name"`
	Id   string `json:"Id"`
}

type embyPerson struct {
	Name            string `json:"Name"`
	Id              string `json:"Id"`
	Role            string `json:"Role"`
	Type            string `json:"Type"`
	PrimaryImageTag string `json:"PrimaryImageTag,omitempty"`
}

type embyUserData struct {
	PlaybackPositionTicks int64   `json:"PlaybackPositionTicks"`
	PlayCount             int     `json:"PlayCount"`
	IsFavorite            bool    `json:"IsFavorite"`
	Played                bool    `json:"Played"`
	PlayedPercentage      float64 `json:"PlayedPercentage,omitempty"`
	LastPlayedDate        string  `json:"LastPlayedDate,omitempty"`
	Key                   string  `json:"Key"`
}

type embyItem struct {
	Name                    string            `json:"Name"`
	OriginalTitle           string            `json:"OriginalTitle,omitempty"`
	SortName                string            `json:"SortName,omitempty"`
	ServerId                string            `json:"ServerId"`
	Id                      string            `json:"Id"`
	Etag                    string            `json:"Etag,omitempty"`
	Type                    string            `json:"Type"`
	CollectionType          string            `json:"CollectionType,omitempty"`
	MediaType               string            `json:"MediaType,omitempty"`
	IsFolder                bool              `json:"IsFolder"`
	ParentId                string            `json:"ParentId,omitempty"`
	Overview                string            `json:"Overview,omitempty"`
	DateCreated             string            `json:"DateCreated,omitempty"`
	PremiereDate            string            `json:"PremiereDate,omitempty"`
	ProductionYear          int               `json:"ProductionYear,omitempty"`
	CommunityRating         float64           `json:"CommunityRating,omitempty"`
	RunTimeTicks            int64             `json:"RunTimeTicks,omitempty"`
	Container               string            `json:"Container,omitempty"`
	Path                    string            `json:"Path,omitempty"`
	LocationType            string            `json:"LocationType,omitempty"`
	VideoType               string            `json:"VideoType,omitempty"`
	PlayAccess              string            `json:"PlayAccess,omitempty"`
	CanDownload             bool              `json:"CanDownload,omitempty"`
	HasSubtitles            bool              `json:"HasSubtitles,omitempty"`
	ChildCount              int               `json:"ChildCount,omitempty"`
	RecursiveItemCount      int               `json:"RecursiveItemCount,omitempty"`
	MovieCount              int               `json:"MovieCount,omitempty"`
	Genres                  []string          `json:"Genres,omitempty"`
	GenreItems              []embyNameID      `json:"GenreItems,omitempty"`
	Studios                 []embyNameID      `json:"Studios,omitempty"`
	Tags                    []string          `json:"Tags,omitempty"`
	Taglines                []string          `json:"Taglines,omitempty"`
	People                  []embyPerson      `json:"People,omitempty"`
	ProviderIds             map[string]string `json:"ProviderIds"`
	ImageTags               map[string]string `json:"ImageTags"`
	BackdropImageTags       []string          `json:"BackdropImageTags"`
	PrimaryImageAspectRatio float64           `json:"PrimaryImageAspectRatio,omitempty"`
	UserData                *embyUserData     `json:"UserData,omitempty"`
	MediaSources            []embyMediaSource `json:"MediaSources,omitempty"`
	MediaStreams            []embyStream      `json:"MediaStreams,omitempty"`
}

func newEmbyItem(id, name, kind string) embyItem {
	return embyItem{Id: id, Name: name, Type: kind, ServerId: embyServerID,
		ProviderIds: map[string]string{}, ImageTags: map[string]string{}, BackdropImageTags: []string{}}
}

func embyResult(items []embyItem, total, start int) gin.H {
	if items == nil {
		items = []embyItem{}
	}
	return gin.H{"Items": items, "TotalRecordCount": total, "StartIndex": start}
}

func imageTag(source string) string {
	if source == "" {
		return ""
	}
	sum := sha1.Sum([]byte(source))
	return hex.EncodeToString(sum[:8])
}

func embyDate(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.0000000Z")
}

// embyState is the viewer's playback and favorites, read once per request.
type embyState struct {
	progress  map[int]lib.Progress
	favorites map[int]bool
}

func (s *embyServer) state(ctx context.Context) (embyState, error) {
	progress, err := s.library.PlayStates(ctx)
	if err != nil {
		return embyState{}, err
	}
	state := embyState{progress: progress, favorites: map[int]bool{}}
	ids, err := s.favoriteIDs(ctx)
	for _, id := range ids {
		state.favorites[id] = true
	}
	return state, err
}

// favoriteCollection is the collection Emby favorites are kept in, so they
// show on the web app as well.
func (s *embyServer) favoriteCollection(ctx context.Context, create bool) (int, error) {
	collections, err := s.library.Collections(ctx)
	if err != nil {
		return 0, err
	}
	for _, collection := range collections {
		if collection.Name == embyFavoritesName {
			return collection.ID, nil
		}
	}
	if !create {
		return 0, nil
	}
	collection, err := s.library.CreateCollection(ctx, embyFavoritesName)
	return collection.ID, err
}

func (s *embyServer) favoriteIDs(ctx context.Context) ([]int, error) {
	id, err := s.favoriteCollection(ctx, false)
	if err != nil || id == 0 {
		return nil, err
	}
	return s.library.CollectionMovieIDs(ctx, id)
}

func (state embyState) userData(movie lib.Movie) *embyUserData {
	data := &embyUserData{IsFavorite: state.favorites[movie.ID], Key: strconv.Itoa(movie.ID)}
	if progress, ok := state.progress[movie.ID]; ok {
		data.Played = progress.Played
		if progress.Played {
			data.PlayCount = 1
		}
		data.PlaybackPositionTicks = int64(progress.Position * ticksPerSecond)
		if duration := movieSeconds(movie, progress); duration > 0 && progress.Position > 0 {
			data.PlayedPercentage = min(progress.Position/duration*100, 100)
		}
		data.LastPlayedDate = embyDate(progress.UpdatedAt)
	}
	return data
}

// movieSeconds prefers the length the web player measured over the
// catalogue's minutes.
func movieSeconds(movie lib.Movie, progress lib.Progress) float64 {
	if progress.Duration > 0 {
		return progress.Duration
	}
	return float64(movie.Duration * 60)
}

func (s *embyServer) movieItem(movie lib.Movie, state embyState) embyItem {
	item := newEmbyItem(strconv.Itoa(movie.ID), movie.Title, "Movie")
	if item.Name == "" {
		item.Name = movie.Code
	}
	item.SortName, item.MediaType, item.ParentId = movie.Code, "Video", strconv.Itoa(embyViewAll)
	item.LocationType, item.VideoType, item.PlayAccess, item.CanDownload = "FileSystem", "VideoFile", "Full", true
	item.DateCreated = embyDate(movie.AddedAt)
	item.CommunityRating = movie.Rating * 2
	item.RunTimeTicks = int64(movie.Duration) * 60 * ticksPerSecond
	item.ProviderIds["Javdb"] = domain.ValueOrZero(movie.JavDBID)
	if item.ProviderIds["Javdb"] == "" {
		delete(item.ProviderIds, "Javdb")
	}
	if release, err := time.Parse(time.DateOnly, movie.ReleaseDate); err == nil {
		item.PremiereDate, item.ProductionYear = embyDate(release), release.Year()
	}
	lines := []string{"番号：" + movie.Code}
	if movie.Series != nil {
		lines = append(lines, "系列："+movie.Series.Name)
		item.Tags = append(item.Tags, movie.Series.Name)
	}
	if movie.Maker != nil {
		lines = append(lines, "片商："+movie.Maker.Name)
		item.Studios = []embyNameID{{Name: movie.Maker.Name, Id: s.nameID("studio", movie.Maker.Name)}}
	}
	if movie.Director != nil {
		lines = append(lines, "导演："+movie.Director.Name)
		item.People = append(item.People, embyPerson{Name: movie.Director.Name, Id: s.nameID("person", movie.Director.Name), Type: "Director"})
	}
	item.Overview = strings.Join(lines, "\n")
	for _, actor := range movie.Actors {
		item.People = append(item.People, embyPerson{Name: actor.Name, Id: s.nameID("person", actor.Name),
			Type: "Actor", PrimaryImageTag: imageTag(actor.Name)})
	}
	for _, tag := range movie.Tags {
		item.Genres = append(item.Genres, tag.Name)
		item.GenreItems = append(item.GenreItems, embyNameID{Name: tag.Name, Id: s.nameID("genre", tag.Name)})
	}
	poster, cover, fanart := domain.ValueOrZero(movie.Poster), domain.ValueOrZero(movie.Cover), movie.Fanart
	if primary := cmp.Or(poster, cover); primary != "" {
		item.ImageTags["Primary"] = imageTag(primary)
		item.PrimaryImageAspectRatio = 1.4925
		if poster != "" {
			item.PrimaryImageAspectRatio = 0.7083
		}
	}
	if cover != "" {
		item.ImageTags["Thumb"] = imageTag(cover)
	}
	if backdrop := cmp.Or(fanart, cover); backdrop != "" {
		item.BackdropImageTags = []string{imageTag(backdrop)}
	}
	item.UserData = state.userData(movie)
	return item
}

func (s *embyServer) viewItem(id int, total int, cover string) embyItem {
	names := map[int]string{embyViewAll: "全部影片", embyViewChinese: "中文字幕", embyViewBoxSets: "收藏夹"}
	item := newEmbyItem(strconv.Itoa(id), names[id], "CollectionFolder")
	item.CollectionType, item.IsFolder, item.ParentId = "movies", true, strconv.Itoa(embyRootID)
	if id == embyViewBoxSets {
		item.CollectionType = "boxsets"
	}
	item.ChildCount, item.RecursiveItemCount = total, total
	if cover != "" {
		item.ImageTags["Primary"] = imageTag(cover)
		item.PrimaryImageAspectRatio = 1.4925
	}
	item.UserData = &embyUserData{Key: item.Id}
	return item
}

func (s *embyServer) boxSetItem(collection lib.Collection) embyItem {
	item := newEmbyItem(strconv.Itoa(embyBoxSetBase+collection.ID), collection.Name, "BoxSet")
	item.IsFolder, item.ParentId = true, strconv.Itoa(embyViewBoxSets)
	item.ChildCount, item.RecursiveItemCount = collection.Count, collection.Count
	if cover := domain.ValueOrZero(collection.Cover); cover != "" {
		item.ImageTags["Primary"] = imageTag(cover)
		item.PrimaryImageAspectRatio = 1.4925
	}
	item.UserData = &embyUserData{Key: item.Id}
	return item
}

func (s *embyServer) namedItemOf(kind string, facet lib.Facet) embyItem {
	types := map[string]string{"person": "Person", "genre": "Genre", "studio": "Studio"}
	item := newEmbyItem(s.nameID(kind, facet.Name), facet.Name, types[kind])
	item.MovieCount, item.ChildCount = facet.Count, facet.Count
	if kind == "person" {
		item.ImageTags["Primary"] = imageTag(facet.Name)
		item.PrimaryImageAspectRatio = 0.6667
	}
	item.UserData = &embyUserData{Key: item.Id}
	return item
}

func (s *embyServer) rootFolder() embyItem {
	item := newEmbyItem(strconv.Itoa(embyRootID), "Media Folders", "UserRootFolder")
	item.IsFolder = true
	return item
}

// viewItems lists the libraries: every movie, the Chinese subtitled ones and
// the collections when there are any.
func (s *embyServer) viewItems(ctx context.Context) ([]embyItem, error) {
	var items []embyItem
	for _, view := range []struct {
		id      int
		chinese bool
	}{{embyViewAll, false}, {embyViewChinese, true}} {
		page, err := s.library.SearchMovies(ctx, lib.MovieFilter{Page: 1, Limit: 1, Chinese: view.chinese})
		if err != nil {
			return nil, err
		}
		if page.Total == 0 && view.chinese {
			continue
		}
		cover := ""
		if len(page.Movies) > 0 {
			cover = domain.ValueOrZero(page.Movies[0].Cover)
		}
		items = append(items, s.viewItem(view.id, page.Total, cover))
	}
	collections, err := s.library.Collections(ctx)
	if err != nil {
		return nil, err
	}
	if len(collections) > 0 {
		items = append(items, s.viewItem(embyViewBoxSets, len(collections), domain.ValueOrZero(collections[0].Cover)))
	}
	return items, nil
}

func (s *embyServer) views(r *embyRequest) {
	items, err := s.viewItems(r.ctx())
	if err != nil {
		r.fail(err)
		return
	}
	r.JSON(http.StatusOK, embyResult(items, len(items), 0))
}

func (s *embyServer) virtualFolders(r *embyRequest) {
	items, err := s.viewItems(r.ctx())
	if err != nil {
		r.fail(err)
		return
	}
	folders := make([]gin.H, 0, len(items))
	for _, item := range items {
		folders = append(folders, gin.H{"Name": item.Name, "ItemId": item.Id, "Id": item.Id,
			"CollectionType": item.CollectionType, "Locations": []string{}})
	}
	r.JSON(http.StatusOK, folders)
}

// embyQueryOf is what a player asked of the movie list.
type embyMovieQuery struct {
	filter   lib.MovieFilter
	random   bool
	start    int
	limit    int
	resume   bool
	played   *bool
	favorite bool
}

var embySorts = map[string]string{
	"datecreated": "added", "dateadded": "added", "dateplayed": "added", "datelastcontentadded": "added",
	"premieredate": "release", "productionyear": "release", "releasedate": "release",
	"sortname": "code", "name": "code", "communityrating": "rating", "criticrating": "rating",
}

// movieQuery maps the Emby list parameters onto the library filter; ok is
// false when the request asks only for kinds of items the library lacks.
func (s *embyServer) movieQuery(r *embyRequest, parent embyRef) (embyMovieQuery, bool) {
	query := embyMovieQuery{start: max(r.qInt("startindex", 0), 0), limit: r.qInt("limit", embyAllMovies)}
	if query.limit <= 0 {
		query.limit = embyAllMovies
	}
	filter := &query.filter
	filter.Query = strings.TrimSpace(r.q("searchterm"))
	switch parent.kind {
	case "view":
		filter.Chinese = parent.id == embyViewChinese
	case "boxset":
		filter.Collection = parent.id
	case "person":
		filter.Actor = parent.name
	case "genre":
		filter.Tag = parent.name
	case "studio":
		filter.Maker = parent.name
	case "year":
		filter.Year = parent.id
	}
	for _, value := range r.qList("personids") {
		if ref, ok := s.ref(r.ctx(), value); ok && ref.kind == "person" {
			filter.Actor = ref.name
		}
	}
	if names := r.qList("person"); len(names) > 0 {
		filter.Actor = names[0]
	}
	for _, value := range r.qList("genreids") {
		if ref, ok := s.ref(r.ctx(), value); ok && ref.kind == "genre" {
			filter.Tag = ref.name
		}
	}
	if names := r.qList("genres"); len(names) > 0 {
		filter.Tag = names[0]
	}
	for _, value := range r.qList("studioids") {
		if ref, ok := s.ref(r.ctx(), value); ok && ref.kind == "studio" {
			filter.Maker = ref.name
		}
	}
	if names := r.qList("studios"); len(names) > 0 {
		filter.Maker = names[0]
	}
	if years := r.qList("years"); len(years) > 0 {
		filter.Year, _ = strconv.Atoi(years[0])
	}
	// Players lead with keys such as IsFolder that do not apply to movies.
	for _, key := range r.qList("sortby") {
		key = strings.ToLower(key)
		if sort, ok := embySorts[key]; ok || key == "random" {
			query.random, filter.Sort = key == "random", sort
			ascending := !strings.HasPrefix(strings.ToLower(r.q("sortorder")), "descending")
			filter.Reverse = ascending != (filter.Sort == "code")
			break
		}
	}
	filters := strings.ToLower(r.q("filters"))
	query.resume = strings.Contains(filters, "isresumable")
	query.favorite = strings.Contains(filters, "isfavorite") || strings.EqualFold(r.q("isfavorite"), "true")
	switch {
	case strings.Contains(filters, "isunplayed") || strings.EqualFold(r.q("isplayed"), "false"):
		query.played = new(false)
	case strings.Contains(filters, "isplayed") || strings.EqualFold(r.q("isplayed"), "true"):
		query.played = new(true)
	}
	types := strings.ToLower(r.q("includeitemtypes"))
	excluded := strings.ToLower(r.q("excludeitemtypes"))
	if types != "" && !strings.Contains(types, "movie") && !strings.Contains(types, "video") {
		return query, false
	}
	if strings.Contains(excluded, "movie") {
		return query, false
	}
	return query, true
}

// movies runs a movie query with the viewer's state applied.
func (s *embyServer) movies(ctx context.Context, query embyMovieQuery, state embyState) ([]embyItem, int, error) {
	filter := query.filter
	restrict := func(ids []int) {
		if filter.IDs == nil {
			filter.IDs = ids
			return
		}
		filter.IDs = slices.DeleteFunc(filter.IDs, func(id int) bool { return !slices.Contains(ids, id) })
	}
	if query.favorite {
		restrict(mapKeys(state.favorites, func(bool) bool { return true }))
	}
	if query.resume {
		restrict(mapKeys(state.progress, func(p lib.Progress) bool { return p.Position > 0 }))
	}
	if query.played != nil {
		played := mapKeys(state.progress, func(p lib.Progress) bool { return p.Played })
		if *query.played {
			restrict(played)
		} else {
			filter.ExcludeIDs = played
		}
	}
	filter.Page, filter.Offset, filter.Limit = 1, query.start, query.limit
	if query.random {
		filter.Offset, filter.Limit = 0, embyAllMovies
	}
	page, err := s.library.SearchMovies(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	movies := page.Movies
	if query.random {
		rand.Shuffle(len(movies), func(i, j int) { movies[i], movies[j] = movies[j], movies[i] })
		movies = movies[min(query.start, len(movies)):]
		movies = movies[:min(query.limit, len(movies))]
	}
	items := make([]embyItem, 0, len(movies))
	for _, movie := range movies {
		items = append(items, s.movieItem(movie, state))
	}
	return items, page.Total, nil
}

func mapKeys[V any](values map[int]V, keep func(V) bool) []int {
	ids := []int{}
	for id, value := range values {
		if keep(value) {
			ids = append(ids, id)
		}
	}
	return ids
}

func (s *embyServer) items(r *embyRequest) {
	ctx := r.ctx()
	if ids := r.qList("ids"); len(ids) > 0 {
		s.itemsByID(r, ids)
		return
	}
	parent := embyRef{}
	if value := r.q("parentid"); value != "" {
		var ok bool
		if parent, ok = s.ref(ctx, value); !ok {
			r.JSON(http.StatusOK, embyResult(nil, 0, 0))
			return
		}
	}
	types := strings.ToLower(r.q("includeitemtypes"))
	recursive := strings.EqualFold(r.q("recursive"), "true")
	browsing := r.q("searchterm") == "" && r.q("personids") == "" && r.q("genreids") == "" &&
		r.q("studioids") == "" && r.q("filters") == "" && r.q("isfavorite") == ""
	switch {
	case (parent.kind == "" || parent.kind == "root") && !recursive && types == "" && browsing:
		s.views(r)
		return
	case parent.kind == "view" && parent.id == embyViewBoxSets, types == "boxset":
		s.boxSets(r)
		return
	case types == "person" || types == "people":
		s.persons(r)
		return
	}
	query, ok := s.movieQuery(r, parent)
	if !ok {
		r.JSON(http.StatusOK, embyResult(nil, 0, query.start))
		return
	}
	state, err := s.state(ctx)
	if err != nil {
		r.fail(err)
		return
	}
	items, total, err := s.movies(ctx, query, state)
	if err != nil {
		r.fail(err)
		return
	}
	r.JSON(http.StatusOK, embyResult(items, total, query.start))
}

func (s *embyServer) itemsByID(r *embyRequest, values []string) {
	var items []embyItem
	for _, value := range values {
		if item, err := s.lookup(r, value, false); err == nil {
			items = append(items, item)
		}
	}
	r.JSON(http.StatusOK, embyResult(items, len(items), 0))
}

func (s *embyServer) boxSets(r *embyRequest) {
	collections, err := s.library.Collections(r.ctx())
	if err != nil {
		r.fail(err)
		return
	}
	items := make([]embyItem, 0, len(collections))
	for _, collection := range collections {
		items = append(items, s.boxSetItem(collection))
	}
	start := min(max(r.qInt("startindex", 0), 0), len(items))
	end := min(start+max(r.qInt("limit", len(items)), 0), len(items))
	r.JSON(http.StatusOK, embyResult(items[start:end], len(items), start))
}

func (s *embyServer) latest(r *embyRequest) {
	ctx := r.ctx()
	parent, _ := s.ref(ctx, r.q("parentid"))
	if parent.kind == "view" && parent.id == embyViewBoxSets {
		r.JSON(http.StatusOK, []embyItem{})
		return
	}
	query, ok := s.movieQuery(r, parent)
	if !ok {
		r.JSON(http.StatusOK, []embyItem{})
		return
	}
	query.filter.Sort, query.filter.Reverse, query.random = "", false, false
	query.start, query.limit = 0, min(max(r.qInt("limit", 20), 1), 100)
	state, err := s.state(ctx)
	if err != nil {
		r.fail(err)
		return
	}
	items, _, err := s.movies(ctx, query, state)
	if err != nil {
		r.fail(err)
		return
	}
	r.JSON(http.StatusOK, items)
}

// resume lists the movies being watched, most recently played first.
func (s *embyServer) resume(r *embyRequest) {
	ctx := r.ctx()
	if types := strings.ToLower(r.q("includeitemtypes")); types != "" && !strings.Contains(types, "movie") {
		r.JSON(http.StatusOK, embyResult(nil, 0, 0))
		return
	}
	watching, err := s.library.ContinueWatching(ctx)
	if err != nil {
		r.fail(err)
		return
	}
	ids := make([]int, 0, len(watching))
	for _, entry := range watching {
		ids = append(ids, entry.Movie.ID)
	}
	items, err := s.moviesByID(ctx, ids)
	if err != nil {
		r.fail(err)
		return
	}
	limit := min(max(r.qInt("limit", len(items)), 0), len(items))
	r.JSON(http.StatusOK, embyResult(items[:limit], len(items), 0))
}

// moviesByID returns the movies in the order of ids.
func (s *embyServer) moviesByID(ctx context.Context, ids []int) ([]embyItem, error) {
	if len(ids) == 0 {
		return []embyItem{}, nil
	}
	state, err := s.state(ctx)
	if err != nil {
		return nil, err
	}
	page, err := s.library.SearchMovies(ctx, lib.MovieFilter{Page: 1, Limit: len(ids), IDs: ids})
	if err != nil {
		return nil, err
	}
	found := map[int]lib.Movie{}
	for _, movie := range page.Movies {
		found[movie.ID] = movie
	}
	items := make([]embyItem, 0, len(ids))
	for _, id := range ids {
		if movie, ok := found[id]; ok {
			items = append(items, s.movieItem(movie, state))
		}
	}
	return items, nil
}

func (s *embyServer) movie(ctx context.Context, id int) (lib.Movie, error) {
	page, err := s.library.SearchMovies(ctx, lib.MovieFilter{Page: 1, Limit: 1, IDs: []int{id}})
	if err != nil {
		return lib.Movie{}, err
	}
	if len(page.Movies) == 0 {
		return lib.Movie{}, domain.E(domain.KindNotFound, "影片不在当前媒体库中", nil)
	}
	return page.Movies[0], nil
}

func (s *embyServer) item(r *embyRequest) {
	item, err := s.lookup(r, r.param("id"), true)
	if err != nil {
		r.fail(err)
		return
	}
	r.JSON(http.StatusOK, item)
}

// lookup builds any kind of item; a movie in detail carries its videos.
func (s *embyServer) lookup(r *embyRequest, value string, detail bool) (embyItem, error) {
	ctx := r.ctx()
	ref, ok := s.ref(ctx, value)
	if !ok {
		return embyItem{}, domain.E(domain.KindNotFound, "项目不存在", nil)
	}
	switch ref.kind {
	case "movie":
		movie, err := s.movie(ctx, ref.id)
		if err != nil {
			return embyItem{}, err
		}
		state, err := s.state(ctx)
		if err != nil {
			return embyItem{}, err
		}
		item := s.movieItem(movie, state)
		if detail {
			info, err := s.library.PlayInfo(ctx, ref.id)
			if err != nil {
				return embyItem{}, err
			}
			item.MediaSources = s.mediaSources(movie, info)
			if len(item.MediaSources) > 0 {
				first := item.MediaSources[0]
				item.MediaStreams, item.Container, item.Path = first.MediaStreams, first.Container, first.Path
			}
			item.HasSubtitles = len(info.Subtitles) > 0
		}
		return item, nil
	case "root":
		return s.rootFolder(), nil
	case "view":
		views, err := s.viewItems(ctx)
		if err != nil {
			return embyItem{}, err
		}
		for _, view := range views {
			if view.Id == value {
				return view, nil
			}
		}
	case "boxset":
		collections, err := s.library.Collections(ctx)
		if err != nil {
			return embyItem{}, err
		}
		for _, collection := range collections {
			if collection.ID == ref.id {
				return s.boxSetItem(collection), nil
			}
		}
	case "year":
		item := newEmbyItem(value, ref.name, "Year")
		item.ProductionYear = ref.id
		return item, nil
	default:
		return s.namedLookup(ctx, ref.kind, ref.name)
	}
	return embyItem{}, domain.E(domain.KindNotFound, "项目不存在", nil)
}

func (s *embyServer) namedLookup(ctx context.Context, kind, name string) (embyItem, error) {
	facets, err := s.facetsCached(ctx)
	if err != nil {
		return embyItem{}, err
	}
	list := map[string][]lib.Facet{"person": facets.Actors, "genre": facets.Tags, "studio": facets.Makers}[kind]
	for _, facet := range list {
		if facet.Name == name {
			return s.namedItemOf(kind, facet), nil
		}
	}
	// Directors and male actors are not among the facets.
	return s.namedItemOf(kind, lib.Facet{Name: name}), nil
}

func embyNamedItem(kind string) func(*embyServer, *embyRequest) {
	return func(s *embyServer, r *embyRequest) {
		item, err := s.namedLookup(r.ctx(), kind, r.param("name"))
		if err != nil {
			r.fail(err)
			return
		}
		r.JSON(http.StatusOK, item)
	}
}

// facetList pages a facet list filtered by the search term.
func (s *embyServer) facetList(r *embyRequest, kind string, pick func(lib.Facets) []lib.Facet) {
	facets, err := s.facetsCached(r.ctx())
	if err != nil {
		r.fail(err)
		return
	}
	term := strings.ToLower(strings.TrimSpace(r.q("searchterm")))
	var items []embyItem
	for _, facet := range pick(facets) {
		if term == "" || strings.Contains(strings.ToLower(facet.Name), term) ||
			(facet.Alias != "" && strings.Contains(strings.ToLower(facet.Alias), term)) {
			items = append(items, s.namedItemOf(kind, facet))
		}
	}
	if strings.EqualFold(r.q("sortby"), "sortname") || strings.EqualFold(r.q("sortby"), "name") {
		slices.SortFunc(items, func(a, b embyItem) int { return strings.Compare(a.Name, b.Name) })
	}
	start := min(max(r.qInt("startindex", 0), 0), len(items))
	end := min(start+max(r.qInt("limit", len(items)), 0), len(items))
	r.JSON(http.StatusOK, embyResult(items[start:end], len(items), start))
}

func (s *embyServer) persons(r *embyRequest) {
	s.facetList(r, "person", func(f lib.Facets) []lib.Facet { return f.Actors })
}

func (s *embyServer) genres(r *embyRequest) {
	s.facetList(r, "genre", func(f lib.Facets) []lib.Facet { return f.Tags })
}

func (s *embyServer) studios(r *embyRequest) {
	s.facetList(r, "studio", func(f lib.Facets) []lib.Facet { return f.Makers })
}

func (s *embyServer) years(r *embyRequest) {
	facets, err := s.facetsCached(r.ctx())
	if err != nil {
		r.fail(err)
		return
	}
	items := make([]embyItem, 0, len(facets.Years))
	for _, facet := range facets.Years {
		year, _ := strconv.Atoi(facet.Name)
		item := newEmbyItem(strconv.Itoa(embyYearBase+year), facet.Name, "Year")
		item.ProductionYear, item.ChildCount = year, facet.Count
		items = append(items, item)
	}
	r.JSON(http.StatusOK, embyResult(items, len(items), 0))
}

func (s *embyServer) filters(r *embyRequest) {
	facets, err := s.facetsCached(r.ctx())
	if err != nil {
		r.fail(err)
		return
	}
	genres := make([]string, 0, len(facets.Tags))
	for _, facet := range facets.Tags {
		genres = append(genres, facet.Name)
	}
	years := make([]int, 0, len(facets.Years))
	for _, facet := range facets.Years {
		year, _ := strconv.Atoi(facet.Name)
		years = append(years, year)
	}
	r.JSON(http.StatusOK, gin.H{"Genres": genres, "Tags": []string{}, "OfficialRatings": []string{}, "Years": years})
}

func (s *embyServer) filters2(r *embyRequest) {
	facets, err := s.facetsCached(r.ctx())
	if err != nil {
		r.fail(err)
		return
	}
	genres := make([]embyNameID, 0, len(facets.Tags))
	for _, facet := range facets.Tags {
		genres = append(genres, embyNameID{Name: facet.Name, Id: s.nameID("genre", facet.Name)})
	}
	r.JSON(http.StatusOK, gin.H{"Genres": genres, "Tags": []embyNameID{}})
}

func (s *embyServer) counts(r *embyRequest) {
	page, err := s.library.SearchMovies(r.ctx(), lib.MovieFilter{Page: 1, Limit: 1})
	if err != nil {
		r.fail(err)
		return
	}
	collections, err := s.library.Collections(r.ctx())
	if err != nil {
		r.fail(err)
		return
	}
	r.JSON(http.StatusOK, gin.H{
		"MovieCount": page.Total, "BoxSetCount": len(collections), "ItemCount": page.Total,
		"SeriesCount": 0, "EpisodeCount": 0, "GameCount": 0, "ArtistCount": 0, "ProgramCount": 0,
		"GameSystemCount": 0, "TrailerCount": 0, "SongCount": 0, "AlbumCount": 0, "MusicVideoCount": 0,
	})
}

// similar suggests other movies of the first actor, else of the maker.
func (s *embyServer) similar(r *embyRequest) {
	ctx := r.ctx()
	ref, ok := s.ref(ctx, r.param("id"))
	if !ok || ref.kind != "movie" {
		r.JSON(http.StatusOK, embyResult(nil, 0, 0))
		return
	}
	movie, err := s.movie(ctx, ref.id)
	if err != nil {
		r.fail(err)
		return
	}
	query := embyMovieQuery{limit: min(max(r.qInt("limit", 12), 1), 50)}
	query.filter.ExcludeIDs = []int{movie.ID}
	switch {
	case len(movie.Actors) > 0:
		query.filter.Actor = movie.Actors[0].Name
	case movie.Maker != nil:
		query.filter.Maker = movie.Maker.Name
	default:
		r.JSON(http.StatusOK, embyResult(nil, 0, 0))
		return
	}
	state, err := s.state(ctx)
	if err != nil {
		r.fail(err)
		return
	}
	items, total, err := s.movies(ctx, query, state)
	if err != nil {
		r.fail(err)
		return
	}
	r.JSON(http.StatusOK, embyResult(items, total, 0))
}

func (s *embyServer) searchHints(r *embyRequest) {
	ctx := r.ctx()
	term := strings.TrimSpace(r.q("searchterm"))
	limit := min(max(r.qInt("limit", 30), 1), 100)
	hints := []gin.H{}
	if term == "" {
		r.JSON(http.StatusOK, gin.H{"SearchHints": hints, "TotalRecordCount": 0})
		return
	}
	types := strings.ToLower(r.q("includeitemtypes"))
	if types == "" || strings.Contains(types, "movie") {
		page, err := s.library.SearchMovies(ctx, lib.MovieFilter{Page: 1, Limit: limit, Query: term})
		if err != nil {
			r.fail(err)
			return
		}
		for _, movie := range page.Movies {
			item := s.movieItem(movie, embyState{})
			hints = append(hints, gin.H{"ItemId": item.Id, "Id": item.Id, "Name": item.Name, "Type": "Movie",
				"MediaType": "Video", "ProductionYear": item.ProductionYear, "RunTimeTicks": item.RunTimeTicks,
				"PrimaryImageTag": item.ImageTags["Primary"], "ThumbImageTag": item.ImageTags["Thumb"],
				"ThumbImageItemId": item.Id, "MatchedTerm": term, "IsFolder": false})
		}
	}
	if types == "" || strings.Contains(types, "person") {
		if facets, err := s.facetsCached(ctx); err == nil {
			lower := strings.ToLower(term)
			for _, facet := range facets.Actors {
				if len(hints) >= limit {
					break
				}
				if strings.Contains(strings.ToLower(facet.Name), lower) || strings.Contains(strings.ToLower(facet.Alias), lower) {
					id := s.nameID("person", facet.Name)
					hints = append(hints, gin.H{"ItemId": id, "Id": id, "Name": facet.Name, "Type": "Person",
						"PrimaryImageTag": imageTag(facet.Name), "MatchedTerm": term, "IsFolder": false})
				}
			}
		}
	}
	r.JSON(http.StatusOK, gin.H{"SearchHints": hints, "TotalRecordCount": len(hints)})
}

// image serves item artwork. Players size images themselves, so the size
// parameters are ignored. Persons, genres and studios are also addressed by
// name under their own paths.
func embyImage(named string) func(*embyServer, *embyRequest) {
	return func(s *embyServer, r *embyRequest) {
		ctx := r.ctx()
		kind := strings.ToLower(r.param("type"))
		ref, ok := s.ref(ctx, r.param("id"))
		if !ok && named != "" {
			ref, ok = embyRef{kind: named, name: r.param("id")}, true
		}
		var media domain.Media
		err := error(os.ErrNotExist)
		switch {
		case !ok:
		case ref.kind == "movie":
			var movie lib.Movie
			if movie, err = s.movie(ctx, ref.id); err == nil {
				poster, cover := domain.ValueOrZero(movie.Poster), domain.ValueOrZero(movie.Cover)
				source := map[string]string{
					"primary": cmp.Or(poster, cover), "thumb": cover, "banner": cover,
					"backdrop": cmp.Or(movie.Fanart, cover),
				}[kind]
				media, err = s.imageBytes(ctx, source)
			}
		case ref.kind == "view" || ref.kind == "boxset":
			media, err = s.folderImage(ctx, ref)
		case ref.kind == "person" && kind == "primary":
			media, err = s.personImage(ctx, ref.name)
		}
		if err != nil {
			r.Status(http.StatusNotFound)
			return
		}
		r.Header("Cache-Control", "public, max-age=86400")
		r.Data(http.StatusOK, media.ContentType, media.Body)
	}
}

func (s *embyServer) folderImage(ctx context.Context, ref embyRef) (domain.Media, error) {
	if ref.kind == "boxset" || ref.id == embyViewBoxSets {
		collections, err := s.library.Collections(ctx)
		if err != nil {
			return domain.Media{}, err
		}
		for _, collection := range collections {
			if collection.ID == ref.id || (ref.kind == "view" && collection.Cover != nil) {
				return s.imageBytes(ctx, domain.ValueOrZero(collection.Cover))
			}
		}
		return domain.Media{}, os.ErrNotExist
	}
	page, err := s.library.SearchMovies(ctx, lib.MovieFilter{Page: 1, Limit: 1, Chinese: ref.id == embyViewChinese})
	if err != nil || len(page.Movies) == 0 {
		return domain.Media{}, cmp.Or(err, os.ErrNotExist)
	}
	return s.imageBytes(ctx, domain.ValueOrZero(page.Movies[0].Cover))
}

// personImage prefers the GFriends portrait, by the Japanese name when the
// library knows one, like the web app does.
func (s *embyServer) personImage(ctx context.Context, name string) (domain.Media, error) {
	names := []string{name}
	avatar := ""
	if facets, err := s.facetsCached(ctx); err == nil {
		for _, facet := range facets.Actors {
			if facet.Name == name {
				if facet.Alias != "" {
					names = []string{facet.Alias, name}
				}
				avatar = facet.Avatar
				break
			}
		}
	}
	if s.avatars != nil {
		for _, candidate := range names {
			if data, err := s.avatars.CachedAvatar(ctx, candidate); err == nil && len(data) > 0 {
				return domain.Media{ContentType: http.DetectContentType(data), Body: data}, nil
			}
		}
	}
	return s.imageBytes(ctx, avatar)
}

func (s *embyServer) imageBytes(ctx context.Context, source string) (domain.Media, error) {
	if source == "" {
		return domain.Media{}, os.ErrNotExist
	}
	if key, ok := strings.CutPrefix(source, mediaimage.URLPrefix); ok {
		if s.artwork == nil {
			return domain.Media{}, os.ErrNotExist
		}
		body, err := s.artwork.Artwork(key)
		if err != nil {
			return domain.Media{}, err
		}
		return domain.Media{ContentType: http.DetectContentType(body), Body: body}, nil
	}
	if s.images == nil || !strings.HasPrefix(source, "http") {
		return domain.Media{}, fmt.Errorf("unsupported image %q: %w", source, os.ErrNotExist)
	}
	return s.images.Media(ctx, source)
}

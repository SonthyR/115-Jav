// Package recommend picks JavDB films the library lacks, from the actresses,
// tags, makers and series it leans on.
package recommend

import (
	"cmp"
	"context"
	"fmt"
	"log/slog"
	"slices"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/ppxb/miyabi/internal/catalogue"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/library"
)

// Catalogue lists JavDB films and tells which the library already has.
type Catalogue interface {
	Browse(context.Context, domain.BrowseOptions) ([]catalogue.Movie, error)
	MovieStates(context.Context, []catalogue.MovieIdentity) ([]catalogue.MovieStateItem, error)
}

// Profile weighs what the library holds.
type Profile interface {
	Taste(context.Context) (library.Taste, error)
}

// Section is one row of recommendations and why it was picked.
type Section struct {
	// Kind is picks, actor, tag, maker or series; ID is the JavDB ID and Name
	// the name of the actor, tag, maker or series a row follows.
	Kind   string            `json:"kind"`
	ID     string            `json:"id,omitempty"`
	Name   string            `json:"name,omitempty"`
	Title  string            `json:"title"`
	Reason string            `json:"reason"`
	Movies []catalogue.Movie `json:"movies"`
}

type Result struct {
	GeneratedAt time.Time     `json:"generated_at"`
	Taste       library.Taste `json:"taste"`
	Sections    []Section     `json:"sections"`
}

// How many of each kind are followed, and how much each says about a film.
const (
	actorRows, tagRows, makerRows, seriesRows = 8, 4, 3, 3
	shownActors, shownTags                    = 6, 3
	shownMakers, shownSeries                  = 2, 2
	rowSize, pickSize                         = 12, 48
	poolSize                                  = 40

	actorScore, tagScore, makerScore, seriesScore = 3, 1.5, 1, 1.5
	ratingScore, recentScore                      = 1, 0.5
)

// ttl keeps a result for a while; building it takes a few dozen JavDB pages.
const ttl = 6 * time.Hour

type Service struct {
	catalogue Catalogue
	profile   Profile
	now       func() time.Time

	mu      sync.Mutex
	result  *Result
	builtAt time.Time
}

func New(catalogue Catalogue, profile Profile) *Service {
	return &Service{catalogue: catalogue, profile: profile, now: time.Now}
}

// Recommendations returns the kept result, building a new one when it is
// stale or refresh is set. Builds run one at a time and outlive the request.
func (s *Service) Recommendations(ctx context.Context, refresh bool) (Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.result != nil && !refresh && s.now().Sub(s.builtAt) < ttl {
		return *s.result, nil
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Minute)
	defer cancel()
	result, err := s.build(ctx)
	if err != nil {
		return Result{}, err
	}
	// An empty result is not kept, so recommendations follow the first scan.
	if len(result.Sections) > 0 {
		s.result, s.builtAt = &result, s.now()
	}
	return result, nil
}

// pool is the films one followed actor, tag, maker or series brings.
type pool struct {
	kind   string
	item   library.TasteItem
	movies []catalogue.Movie
}

func (s *Service) build(ctx context.Context) (Result, error) {
	taste, err := s.profile.Taste(ctx)
	if err != nil {
		return Result{}, err
	}
	result := Result{GeneratedAt: s.now(), Taste: trim(taste), Sections: []Section{}}
	var pools []*pool
	follow := func(kind string, items []library.TasteItem, limit int) {
		for _, item := range items[:min(limit, len(items))] {
			pools = append(pools, &pool{kind: kind, item: item})
		}
	}
	follow("actor", taste.Actors, actorRows)
	follow("tag", taste.Tags, tagRows)
	follow("maker", taste.Makers, makerRows)
	follow("series", taste.Series, seriesRows)
	if len(pools) == 0 {
		return result, nil
	}

	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(3)
	var mu sync.Mutex
	var failure error
	failed := 0
	for _, p := range pools {
		group.Go(func() error {
			movies, err := s.catalogue.Browse(groupCtx, browseOptions(p))
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				slog.WarnContext(ctx, "list recommendation candidates", "kind", p.kind, "id", p.item.ID, "error", err)
				failure = err
				failed++
				return nil
			}
			p.movies = movies
			return nil
		})
	}
	_ = group.Wait()
	if failed == len(pools) {
		return Result{}, fmt.Errorf("从 JavDB 获取推荐失败: %w", failure)
	}

	owned, err := s.owned(ctx, pools)
	if err != nil {
		return Result{}, err
	}
	result.Sections = append(result.Sections, picks(pools, owned, s.now()))
	shown := map[string]int{"actor": shownActors, "tag": shownTags, "maker": shownMakers, "series": shownSeries}
	for _, kind := range []string{"actor", "tag", "maker", "series"} {
		for _, p := range pools {
			if p.kind != kind || shown[kind] == 0 {
				continue
			}
			var movies []catalogue.Movie
			for _, movie := range p.movies {
				if owned[movie.ID] == "" && len(movies) < rowSize {
					movies = append(movies, movie)
				}
			}
			if len(movies) == 0 {
				continue
			}
			shown[kind]--
			result.Sections = append(result.Sections, row(p, movies))
		}
	}
	if len(result.Sections[0].Movies) == 0 {
		result.Sections = result.Sections[1:]
	}
	return result, nil
}

// owned maps the candidates the library holds, or is fetching, to their state.
func (s *Service) owned(ctx context.Context, pools []*pool) (map[string]catalogue.MovieState, error) {
	var identities []catalogue.MovieIdentity
	seen := map[string]bool{}
	for _, p := range pools {
		for _, movie := range p.movies {
			if !seen[movie.ID] {
				seen[movie.ID] = true
				identities = append(identities, catalogue.MovieIdentity{ID: movie.ID, Code: movie.Code})
			}
		}
	}
	states, err := s.catalogue.MovieStates(ctx, identities)
	if err != nil {
		return nil, err
	}
	owned := map[string]catalogue.MovieState{}
	for _, state := range states {
		if state.State == catalogue.MovieInLibrary {
			owned[state.ID] = state.State
		}
	}
	return owned, nil
}

func browseOptions(p *pool) domain.BrowseOptions {
	options := domain.BrowseOptions{Sort: "release", Order: "desc", Page: 1, Limit: poolSize}
	switch p.kind {
	case "actor":
		options.EntityType, options.EntityID = domain.EntityActor, p.item.ID
	case "maker":
		options.EntityType, options.EntityID, options.Main = domain.EntityMaker, p.item.ID, []string{"m"}
	case "series":
		options.EntityType, options.EntityID = domain.EntitySeries, p.item.ID
	case "tag":
		// The best rated films with magnets carrying the tag.
		options.Zone, options.TagIDs, options.Main, options.Sort = domain.ZoneCensored, []string{p.item.ID}, []string{"m"}, "score"
	}
	return options
}

// picks ranks every downloadable candidate by how many followed rows bring
// it and how heavily the library leans on them, then by rating and recency.
func picks(pools []*pool, owned map[string]catalogue.MovieState, now time.Time) Section {
	type candidate struct {
		movie catalogue.Movie
		score float64
	}
	weight := map[string]float64{"actor": actorScore, "tag": tagScore, "maker": makerScore, "series": seriesScore}
	byID := map[string]*candidate{}
	var order []string
	for _, p := range pools {
		for _, movie := range p.movies {
			if owned[movie.ID] != "" || movie.ReleaseStatus == catalogue.ReleaseUpcoming || movie.MagnetsCount == 0 {
				continue
			}
			found := byID[movie.ID]
			if found == nil {
				found = &candidate{movie: movie, score: ratingScore * min(movie.Rating, 5) / 5}
				if released, err := time.Parse(time.DateOnly, movie.ReleaseDate); err == nil && now.Sub(released) < 365*24*time.Hour {
					found.score += recentScore
				}
				byID[movie.ID] = found
				order = append(order, movie.ID)
			}
			found.score += weight[p.kind] * p.item.Weight
		}
	}
	ranked := make([]*candidate, 0, len(order))
	for _, id := range order {
		ranked = append(ranked, byID[id])
	}
	slices.SortStableFunc(ranked, func(a, b *candidate) int { return cmp.Compare(b.score, a.score) })
	movies := make([]catalogue.Movie, 0, min(pickSize, len(ranked)))
	for _, found := range ranked[:min(pickSize, len(ranked))] {
		movies = append(movies, found.movie)
	}
	return Section{Kind: "picks", Title: "猜你喜欢", Reason: "综合你常看的演员、标签、厂牌和系列，收藏和看过的片子分量更重", Movies: movies}
}

func row(p *pool, movies []catalogue.Movie) Section {
	section := Section{Kind: p.kind, ID: p.item.ID, Name: p.item.Name, Movies: movies}
	switch p.kind {
	case "actor":
		section.Title = p.item.Name + " 的新作"
		section.Reason = fmt.Sprintf("你库里有她 %d 部", p.item.Count)
	case "tag":
		section.Title = "「" + p.item.Name + "」高分片"
		section.Reason = fmt.Sprintf("你库里 %d 部带这个标签", p.item.Count)
	case "maker":
		section.Title = p.item.Name + " 新作"
		section.Reason = fmt.Sprintf("你库里有这家厂牌 %d 部", p.item.Count)
	case "series":
		section.Title = "系列：" + p.item.Name
		section.Reason = fmt.Sprintf("你库里有这个系列 %d 部", p.item.Count)
	}
	return section
}

// trim keeps the heaviest few of each kind for showing the profile.
func trim(taste library.Taste) library.Taste {
	first := func(items []library.TasteItem) []library.TasteItem {
		return slices.Clone(items[:min(10, len(items))])
	}
	return library.Taste{Movies: taste.Movies, Actors: first(taste.Actors), Tags: first(taste.Tags),
		Makers: first(taste.Makers), Series: first(taste.Series)}
}

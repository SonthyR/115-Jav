package providers

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/ppxb/miyabi/internal/catalogue"
	"github.com/ppxb/miyabi/internal/codeid"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/metadata"
)

// The catalogue owns its clients and cache; this adapter does not close them.
type JavDBCatalogue interface {
	Search(context.Context, string, domain.SearchOptions) ([]catalogue.Movie, error)
	CatalogueDetail(context.Context, string) (domain.MovieDetail, error)
	RefreshCatalogueDetail(context.Context, string) (domain.MovieDetail, error)
	Media(context.Context, string) (domain.Media, error)
}

type JavDB struct{ catalogue JavDBCatalogue }

func NewJavDB(catalogue JavDBCatalogue) *JavDB { return &JavDB{catalogue: catalogue} }
func (*JavDB) ID() string                      { return "javdb" }
func (*JavDB) Supports(string) bool            { return true }
func (s *JavDB) Media(ctx context.Context, url string) (domain.Media, error) {
	return s.catalogue.Media(ctx, url)
}

func (s *JavDB) Fetch(ctx context.Context, ref domain.MovieRef) (domain.MovieMetadata, error) {
	code := codeid.Normalize(ref.Code)
	id := ref.JavDBID
	if id == "" {
		var candidates []domain.Movie
		for _, query := range codeid.Queries(code) {
			movies, err := s.catalogue.Search(ctx, query, domain.SearchOptions{Zone: domain.ZoneAll, Page: 1, Limit: 100})
			if err != nil {
				return domain.MovieMetadata{}, err
			}
			if len(movies) >= 100 {
				return domain.MovieMetadata{}, fmt.Errorf("JavDB 检索结果过多，无法可靠确认影片")
			}
			for _, movie := range movies {
				candidates = append(candidates, movie.Movie)
			}
		}
		// Do not use ResolveMovieID here: it performs weaker matching internally.
		// The metadata service owns matching layers across all sources.
		for _, exact := range []bool{true, false} {
			var matched []domain.Movie
			for _, candidate := range candidates {
				matches := codeid.IsFormatEquivalent(candidate.Code, code)
				if exact {
					matches = codeid.Normalize(candidate.Code) == code
				}
				if matches && !slices.ContainsFunc(matched, func(m domain.Movie) bool { return m.ID == candidate.ID }) {
					matched = append(matched, candidate)
				}
			}
			if len(matched) > 1 && ref.ReleaseDate != "" {
				matched = byReleaseDate(matched, ref.ReleaseDate)
				if len(matched) == 0 {
					return domain.MovieMetadata{}, domain.E(domain.KindConflict, "JavDB 同番号对应多个影片，发行日期都对不上", nil)
				}
			}
			if len(matched) > 1 {
				return domain.MovieMetadata{}, domain.E(domain.KindConflict, "JavDB 同番号对应多个影片", nil)
			}
			if len(matched) == 1 {
				id = matched[0].ID
				break
			}
		}
		if id == "" {
			return domain.MovieMetadata{}, metadata.ErrNotFound
		}
	}
	detail := s.catalogue.CatalogueDetail
	if ref.Refresh {
		detail = s.catalogue.RefreshCatalogueDetail
	}
	m, err := detail(ctx, id)
	if err != nil {
		return domain.MovieMetadata{}, err
	}
	if !codeid.IsFormatEquivalent(m.Code, code) {
		return domain.MovieMetadata{}, metadata.ErrNotFound
	}
	if m.ID != id || m.Title == "" {
		return domain.MovieMetadata{}, fmt.Errorf("JavDB 返回了不完整的影片身份")
	}
	m.Sources = []domain.SourceID{{Provider: "javdb", ID: id}}
	m.RatingSource, m.RatingMax = "javdb", 5
	// Never mutate the catalogue's shared detail cache while assigning source identities.
	m.Actors = slices.Clone(m.Actors)
	for i := range m.Actors {
		m.Actors[i].Provider = "javdb"
	}
	m.Tags = slices.Clone(m.Tags)
	for i := range m.Tags {
		m.Tags[i].Provider = "javdb"
	}
	if m.Maker != nil {
		copy := *m.Maker
		copy.Provider = "javdb"
		m.Maker = &copy
	}
	if m.Series != nil {
		copy := *m.Series
		copy.Provider = "javdb"
		m.Series = &copy
	}
	if m.Director != nil {
		copy := *m.Director
		copy.Provider = "javdb"
		m.Director = &copy
	}
	result := domain.MovieMetadata{Detail: m}
	if m.Cover != "" {
		result.Images = append(result.Images, domain.ImageCandidate{Provider: "javdb", URL: m.Cover, Role: "cover"})
	}
	for _, image := range m.PreviewImages {
		url := image.Original
		if url == "" {
			url = image.Thumbnail
		}
		if url != "" {
			result.Images = append(result.Images, domain.ImageCandidate{Provider: "javdb", URL: url, Role: "preview"})
		}
	}
	return result, nil
}

// releaseDateSlack covers sources that record the sale date and the
// streaming date of one release differently.
const releaseDateSlack = 90 * 24 * time.Hour

// byReleaseDate keeps the entries released on date, or failing that the
// entries released within releaseDateSlack of it.
func byReleaseDate(movies []domain.Movie, date string) []domain.Movie {
	want, err := time.Parse(time.DateOnly, date)
	if err != nil {
		return nil
	}
	var exact, near []domain.Movie
	for _, movie := range movies {
		released, err := time.Parse(time.DateOnly, movie.ReleaseDate[:min(len(movie.ReleaseDate), len(time.DateOnly))])
		if err != nil {
			continue
		}
		switch gap := released.Sub(want).Abs(); {
		case gap == 0:
			exact = append(exact, movie)
		case gap <= releaseDateSlack:
			near = append(near, movie)
		}
	}
	if len(exact) > 0 {
		return exact
	}
	return near
}

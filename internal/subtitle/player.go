package subtitle

import (
	"context"
	"fmt"
	"os"
	"sync"

	"github.com/ppxb/miyabi/internal/domain"
	subtitlemeta "github.com/ppxb/miyabi/internal/domain/subtitle"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/file"
	"github.com/ppxb/miyabi/internal/ent/subtitle"
)

// maxSearches bounds the movies whose online search results are kept for the player.
const maxSearches = 32

// SearchResult is an online subtitle the player can load by its index.
type SearchResult struct {
	Index    int    `json:"index"`
	Name     string `json:"name"`
	Provider string `json:"provider"`
	Language string `json:"language"`
	Format   string `json:"format"`
}

// Player serves subtitles to the web player as WebVTT.
type Player struct {
	db     *ent.Client
	finder *Finder

	mu       sync.Mutex
	searches map[int][]Candidate
	order    []int
}

func NewPlayer(db *ent.Client, finder *Finder) *Player {
	return &Player{db: db, finder: finder, searches: map[int][]Candidate{}}
}

// Track reads a saved subtitle of the movie.
func (p *Player) Track(ctx context.Context, movieID, id int) (string, error) {
	track, err := p.db.Subtitle.Query().Where(subtitle.IDEQ(id), subtitle.MovieIDEQ(movieID)).Only(ctx)
	if ent.IsNotFound(err) || (err == nil && track.StoragePath == "") {
		return "", domain.E(domain.KindNotFound, "字幕不存在", err)
	}
	if err != nil {
		return "", fmt.Errorf("read subtitle: %w", err)
	}
	raw, err := os.ReadFile(track.StoragePath)
	if err != nil {
		return "", domain.E(domain.KindNotFound, "字幕文件不存在", err)
	}
	text, err := DecodeToUTF8(raw)
	if err != nil {
		return "", fmt.Errorf("decode subtitle: %w", err)
	}
	return ToVTT(text, track.Format), nil
}

// Search queries online providers by the movie's code and keeps the results,
// so Fetch only downloads URLs the server found itself.
func (p *Player) Search(ctx context.Context, movieID int) ([]SearchResult, error) {
	record, err := p.db.Movie.Get(ctx, movieID)
	if ent.IsNotFound(err) {
		return nil, domain.E(domain.KindNotFound, "影片不存在", err)
	}
	if err != nil {
		return nil, fmt.Errorf("read movie: %w", err)
	}
	names, err := p.db.File.Query().Where(file.MovieIDEQ(movieID)).Select(file.FieldName).Strings(ctx)
	if err != nil {
		return nil, fmt.Errorf("list movie videos: %w", err)
	}
	uncensored := false
	for _, name := range names {
		uncensored = uncensored || subtitlemeta.IsUncensored(name)
	}
	candidates := p.finder.Search(ctx, record.Code, uncensored)
	p.mu.Lock()
	if _, ok := p.searches[movieID]; !ok {
		p.order = append(p.order, movieID)
		if len(p.order) > maxSearches {
			delete(p.searches, p.order[0])
			p.order = p.order[1:]
		}
	}
	p.searches[movieID] = candidates
	p.mu.Unlock()
	results := make([]SearchResult, 0, len(candidates))
	for i, candidate := range candidates {
		results = append(results, SearchResult{Index: i, Name: candidate.Name, Provider: candidate.Provider,
			Language: string(candidate.Language), Format: candidate.Format})
	}
	return results, nil
}

// Fetch downloads a result of the movie's last search.
func (p *Player) Fetch(ctx context.Context, movieID, index int) (string, error) {
	p.mu.Lock()
	candidates := p.searches[movieID]
	p.mu.Unlock()
	if index < 0 || index >= len(candidates) {
		return "", domain.E(domain.KindNotFound, "字幕搜索结果已过期，请重新搜索", nil)
	}
	body, _, err := p.finder.Download(ctx, candidates[index])
	if err != nil {
		return "", domain.E(domain.KindUpstream, "下载字幕失败", err)
	}
	text, err := DecodeToUTF8(body)
	if err != nil {
		return "", fmt.Errorf("decode subtitle: %w", err)
	}
	return ToVTT(text, candidates[index].Format), nil
}

package subtitle

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/ppxb/miyabi/internal/domain"
	subtitlemeta "github.com/ppxb/miyabi/internal/domain/subtitle"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/file"
	"github.com/ppxb/miyabi/internal/ent/subtitle"
	"github.com/ppxb/miyabi/internal/export"
	"github.com/ppxb/miyabi/internal/pan"
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
	export *export.Manager

	mu       sync.Mutex
	searches map[int][]Candidate
	order    []int
}

func NewPlayer(db *ent.Client, finder *Finder, exports *export.Manager) *Player {
	return &Player{db: db, finder: finder, export: exports, searches: map[int][]Candidate{}}
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

// Fetch downloads a result of the movie's last search and saves it beside
// the movie's .strm, so Emby and later playback find it too.
func (p *Player) Fetch(ctx context.Context, movieID, index int) (string, error) {
	p.mu.Lock()
	candidates := p.searches[movieID]
	p.mu.Unlock()
	if index < 0 || index >= len(candidates) {
		return "", domain.E(domain.KindNotFound, "字幕搜索结果已过期，请重新搜索", nil)
	}
	candidate := candidates[index]
	body, language, err := p.finder.Download(ctx, candidate)
	if err != nil {
		return "", domain.E(domain.KindUpstream, "下载字幕失败", err)
	}
	candidate.Language = language
	if err := p.save(ctx, movieID, candidate, body); err != nil {
		return "", err
	}
	text, err := DecodeToUTF8(body)
	if err != nil {
		return "", fmt.Errorf("decode subtitle: %w", err)
	}
	return ToVTT(text, candidate.Format), nil
}

// save keeps one subtitle per kind, as Export does. Multi-part movies export
// one .strm per part, which a whole-movie subtitle fits none of, so they
// keep the subtitle only for this playback.
func (p *Player) save(ctx context.Context, movieID int, candidate Candidate, body []byte) error {
	embyDir := p.export.Config().EmbyDir
	record, err := p.db.Movie.Get(ctx, movieID)
	if err != nil {
		return fmt.Errorf("read movie: %w", err)
	}
	names, err := p.db.File.Query().Where(file.MovieIDEQ(movieID)).Select(file.FieldName).Strings(ctx)
	if err != nil {
		return fmt.Errorf("list movie videos: %w", err)
	}
	if embyDir == "" || len(names) != 1 {
		return nil
	}
	target := subtitlemeta.Target{
		Dir:  export.EmbyMovieDir(embyDir, record.Code),
		Stem: export.MediaStem(record.Code, []pan.File{{Name: names[0]}}),
	}
	destination := target.Path(candidate.Kind())
	if err := writeFile(destination, body); err != nil {
		return err
	}
	exists, err := p.db.Subtitle.Query().Where(subtitle.MovieIDEQ(movieID), subtitle.StoragePathEQ(destination)).Exist(ctx)
	if err != nil || exists {
		return err
	}
	err = p.db.Subtitle.Create().SetMovieID(movieID).SetName(filepath.Base(destination)).
		SetLanguage(string(candidate.Language)).SetFormat(candidate.Format).SetVersionTag(string(candidate.Version)).
		SetSource(candidate.Provider).SetSourceURL(candidate.URL).SetStoragePath(destination).Exec(ctx)
	if err != nil {
		return fmt.Errorf("record online subtitle: %w", err)
	}
	return nil
}

package library

import (
	"context"
	"fmt"
	"time"

	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/file"
	"github.com/ppxb/miyabi/internal/ent/movie"
	"github.com/ppxb/miyabi/internal/ent/playbackprogress"
	"github.com/ppxb/miyabi/internal/ent/subtitle"
)

// continueLimit bounds the continue watching row on the home page.
const continueLimit = 20

// PlayFile is a 115 video of a movie, streamed through the STRM relay.
type PlayFile struct {
	FileID string `json:"file_id"`
	Name   string `json:"name"`
	Size   int64  `json:"size"`
}

type PlaySubtitle struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Language string `json:"language"`
	Format   string `json:"format"`
}

type Progress struct {
	FileID    string    `json:"file_id"`
	Position  float64   `json:"position"`
	Duration  float64   `json:"duration"`
	UpdatedAt time.Time `json:"updated_at"`
}

type PlayInfo struct {
	Files     []PlayFile     `json:"files"`
	Subtitles []PlaySubtitle `json:"subtitles"`
	Progress  *Progress      `json:"progress,omitempty"`
}

type ContinueItem struct {
	Movie    Movie    `json:"movie"`
	Progress Progress `json:"progress"`
}

// PlayInfo lists the movie's 115 videos in name order, so parts follow each
// other, with its saved subtitles and where playback stopped.
func (s *Service) PlayInfo(ctx context.Context, id int) (PlayInfo, error) {
	info := PlayInfo{Files: []PlayFile{}, Subtitles: []PlaySubtitle{}}
	if _, err := s.detailRecord(ctx, id); err != nil {
		return info, err
	}
	source := s.Source()
	if source == nil {
		return info, domain.E(domain.KindConflict, "尚未连接 115", nil)
	}
	files, err := s.database.File.Query().
		Where(file.MovieIDEQ(id), database.LibraryFiles(*source)).
		Order(ent.Asc(file.FieldName), ent.Asc(file.FieldID)).All(ctx)
	if err != nil {
		return info, fmt.Errorf("list movie videos: %w", err)
	}
	for _, record := range files {
		info.Files = append(info.Files, PlayFile{FileID: record.FileID, Name: record.Name, Size: record.Size})
	}
	tracks, err := s.database.Subtitle.Query().
		Where(subtitle.MovieIDEQ(id), subtitle.StoragePathNEQ("")).
		Order(ent.Asc(subtitle.FieldID)).All(ctx)
	if err != nil {
		return info, fmt.Errorf("list movie subtitles: %w", err)
	}
	for _, track := range tracks {
		info.Subtitles = append(info.Subtitles, PlaySubtitle{ID: track.ID, Name: track.Name, Language: track.Language, Format: track.Format})
	}
	record, err := s.database.PlaybackProgress.Query().Where(playbackprogress.MovieIDEQ(id)).Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return info, fmt.Errorf("read playback progress: %w", err)
	}
	if record != nil {
		progress := progressOf(record)
		info.Progress = &progress
	}
	return info, nil
}

// SaveProgress keeps one position per movie, replacing the previous one.
func (s *Service) SaveProgress(ctx context.Context, id int, progress Progress) error {
	if _, err := s.detailRecord(ctx, id); err != nil {
		return err
	}
	err := s.database.PlaybackProgress.Create().
		SetMovieID(id).SetFileID(progress.FileID).
		SetPosition(progress.Position).SetDuration(progress.Duration).
		OnConflictColumns(playbackprogress.FieldMovieID).
		UpdateFileID().UpdatePosition().UpdateDuration().UpdateUpdatedAt().
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("save playback progress: %w", err)
	}
	return nil
}

// ClearProgress forgets where playback stopped, as when a movie is finished.
func (s *Service) ClearProgress(ctx context.Context, id int) error {
	_, err := s.database.PlaybackProgress.Delete().Where(playbackprogress.MovieIDEQ(id)).Exec(ctx)
	if err != nil {
		return fmt.Errorf("clear playback progress: %w", err)
	}
	return nil
}

// ContinueWatching lists the most recently played movies of the current library.
func (s *Service) ContinueWatching(ctx context.Context) ([]ContinueItem, error) {
	scope := libraryScope(s.Source())
	records, err := s.database.PlaybackProgress.Query().
		Where(playbackprogress.HasMovieWith(movie.HasFilesWith(scope))).
		Order(ent.Desc(playbackprogress.FieldUpdatedAt)).
		Limit(continueLimit).
		WithMovie().All(ctx)
	if err != nil {
		return nil, fmt.Errorf("list playback progress: %w", err)
	}
	items := make([]ContinueItem, 0, len(records))
	for _, record := range records {
		item := record.Edges.Movie
		summary := Movie{ID: item.ID, Code: item.Code, Title: item.Title, Cover: item.Cover, Poster: item.Poster,
			Actors: []Entity{}, Tags: []Tag{}, ScrapeStatus: item.ScrapeStatus}
		if len(item.Fanarts) > 0 {
			summary.Fanart = item.Fanarts[0]
		}
		items = append(items, ContinueItem{Movie: summary, Progress: progressOf(record)})
	}
	return items, nil
}

func progressOf(record *ent.PlaybackProgress) Progress {
	return Progress{FileID: record.FileID, Position: record.Position, Duration: record.Duration, UpdatedAt: record.UpdatedAt}
}

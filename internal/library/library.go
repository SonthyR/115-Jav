package library

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/drive"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/actor"
	"github.com/ppxb/miyabi/internal/ent/collectionitem"
	"github.com/ppxb/miyabi/internal/ent/file"
	"github.com/ppxb/miyabi/internal/ent/movie"
	"github.com/ppxb/miyabi/internal/ent/predicate"
	"github.com/ppxb/miyabi/internal/ent/tag"
	"github.com/ppxb/miyabi/internal/ent/task"
	"github.com/ppxb/miyabi/internal/export"
	mediaimage "github.com/ppxb/miyabi/internal/image"
	"github.com/ppxb/miyabi/internal/library/scan"
	"github.com/ppxb/miyabi/internal/syncx"
	"github.com/ppxb/miyabi/internal/tasks"
)

type Entity struct {
	Provider string `json:"provider,omitempty"`
	ID       string `json:"id,omitempty"`
	Name     string `json:"name"`
}

type Tag struct {
	ID       int    `json:"id"`
	Provider string `json:"provider"`
	SourceID string `json:"source_id"`
	Name     string `json:"name"`
}

type Movie struct {
	ID           int                `json:"id"`
	Code         string             `json:"code"`
	Title        string             `json:"title"`
	JavDBID      *string            `json:"javdb_id,omitempty"`
	Cover        *string            `json:"cover,omitempty"`
	Poster       *string            `json:"poster,omitempty"`
	Fanart       string             `json:"fanart,omitempty"`
	ReleaseDate  string             `json:"release_date,omitempty"`
	Duration     int                `json:"duration"`
	Rating       float64            `json:"rating"`
	Director     *Entity            `json:"director,omitempty"`
	Maker        *Entity            `json:"maker,omitempty"`
	Series       *Entity            `json:"series,omitempty"`
	Actors       []Entity           `json:"actors"`
	Tags         []Tag              `json:"tags"`
	ScrapeStatus movie.ScrapeStatus `json:"scrape_status"`
	// FileCount is how many videos of the movie, versions or parts, the library holds.
	FileCount int `json:"file_count"`
}

type Page struct {
	Source  *domain.LibrarySource `json:"source,omitempty"`
	Movies  []Movie               `json:"movies"`
	Total   int                   `json:"total"`
	Page    int                   `json:"page"`
	HasMore bool                  `json:"has_more"`
}

type Service struct {
	database     *ent.Client
	drive        *drive.Drive
	tasks        *tasks.Service
	scanner      *scan.Scanner
	localScanner *scan.LocalScanner
	exportMgr    *export.Manager
	scanLock     syncx.ContextLock
}

type Options struct {
	ExportManager *export.Manager
	// Pacing defaults to scan.DefaultPacing; tests can provide a no-op.
	Pacing func(context.Context) error
}

func New(database *ent.Client, d *drive.Drive, tasks *tasks.Service, images *mediaimage.Cache, options Options) *Service {
	svc := &Service{
		database:     database,
		drive:        d,
		tasks:        tasks,
		scanner:      scan.New(d, database, images, tasks, options.ExportManager, options.Pacing),
		localScanner: scan.NewLocalScanner(database, images),
		exportMgr:    options.ExportManager,
	}
	if d != nil && tasks != nil {
		d.SetMountListener(func(ctx context.Context, event drive.MountEvent) error {
			if event.Source.Directory.ID != "" {
				if _, err := svc.EnqueueFreshScan(ctx, event.Source); err != nil {
					return err
				}
			}
			tasks.NotifyLibraryChanged()
			return nil
		})
	}
	return svc
}

func (s *Service) StartScan(ctx context.Context) (domain.TaskInfo, error) {
	sess, err := s.drive.Open(ctx)
	if err != nil {
		return domain.TaskInfo{}, err
	}
	return s.EnqueueScan(ctx, sess.Source())
}

// StartRebuild scans the current source and refreshes every matched movie.
func (s *Service) StartRebuild(ctx context.Context) (domain.TaskInfo, error) {
	sess, err := s.drive.Open(ctx)
	if err != nil {
		return domain.TaskInfo{}, err
	}
	return s.enqueueScan(ctx, sess.Source(), true, task.StatusQueued, task.StatusRunning)
}

// Source returns the currently mounted library source, or nil if unmounted.
func (s *Service) Source() *domain.LibrarySource {
	if s.drive == nil {
		return nil
	}
	return s.drive.Source()
}

// MatchingMovies queries local movies matching any of the given JavDB IDs or normalized codes
// that possess indexed files in the currently mounted library source or local library.
func (s *Service) MatchingMovies(ctx context.Context, javdbIDs []string, codes []string) ([]domain.LocalMovie, error) {
	if len(javdbIDs) == 0 && len(codes) == 0 {
		return nil, nil
	}
	records, err := s.database.Movie.Query().Where(
		movie.Or(movie.JavdbIDIn(javdbIDs...), movie.And(movie.JavdbIDIsNil(), movie.CodeIn(codes...))),
		movie.HasFilesWith(libraryScope(s.Source())),
	).Select(movie.FieldID, movie.FieldCode, movie.FieldJavdbID).All(ctx)
	if err != nil {
		return nil, fmt.Errorf("query matching movies: %w", err)
	}
	result := make([]domain.LocalMovie, len(records))
	for i, r := range records {
		result[i] = domain.LocalMovie{
			ID:      r.ID,
			Code:    r.Code,
			JavDBID: r.JavdbID,
		}
	}
	return result, nil
}

// SetMediaNotifier binds the library/Emby cycle before task workers start.
func (s *Service) SetMediaNotifier(notifier export.MediaNotifier) {
	s.scanner.SetMediaNotifier(notifier)
	s.localScanner.SetMediaNotifier(notifier)
}

func (s *Service) Scan(ctx context.Context, job tasks.Job) error {
	if err := s.scanLock.Lock(ctx); err != nil {
		return err
	}
	defer s.scanLock.Unlock()
	payload, err := tasks.DecodePayload[domain.ScanPayload](job.Payload)
	if err != nil {
		return err
	}
	if payload.Source.AccountID == domain.LocalAccountID {
		// Imports must not observe partially rewritten STRM or exported sidecars.
		return s.exportMgr.WithConfig(func(export.Config) error {
			return s.scanLocal(ctx, job.ID, payload)
		})
	}
	return s.scanner.Run(ctx, job)
}

func (s *Service) Finished(_ context.Context, _ *ent.Tx, job tasks.Job, _ error) (tasks.Change, error) {
	payload, err := tasks.DecodePayload[domain.ScanPayload](job.Payload)
	if err == nil && payload.Source.AccountID == domain.LocalAccountID {
		return tasks.ChangeLibrary, nil
	}
	return tasks.ChangeOffline, nil
}

// EnqueueTargetedScan creates a targeted scan task inside the caller's transaction.
func (s *Service) EnqueueTargetedScan(ctx context.Context, tx *ent.Tx, source domain.LibrarySource, targetID string, offlineTaskID int, code, javdbID string) (int, error) {
	encoded, err := tasks.EncodePayload(domain.ScanPayload{
		Source:        source,
		Scan:          domain.ScanProgress{Stage: "queued", CurrentPath: source.Directory.Path},
		TargetID:      targetID,
		OfflineTaskID: offlineTaskID,
		Code:          code,
		JavDBID:       javdbID,
	})
	if err != nil {
		return 0, err
	}
	taskRecord, err := tx.Task.Create().
		SetType(tasks.KindScan.String()).
		SetPayload(encoded).
		Save(ctx)
	if err != nil {
		return 0, err
	}
	tx.OnCommit(func(next ent.Committer) ent.Committer {
		return ent.CommitFunc(func(ctx context.Context, tx *ent.Tx) error {
			if err := next.Commit(ctx, tx); err != nil {
				return err
			}
			s.tasks.WakePool()
			return nil
		})
	})
	return taskRecord.ID, nil
}

func libraryScope(source *domain.LibrarySource) predicate.File {
	local := file.AccountIDEQ(domain.LocalAccountID)
	if source != nil {
		return file.Or(database.LibraryFiles(*source), local)
	}
	return local
}

func (s *Service) Movies(ctx context.Context, page, limit int) (Page, error) {
	return s.SearchMovies(ctx, MovieFilter{Page: page, Limit: limit})
}

// MovieFilter narrows and orders the library listing.
type MovieFilter struct {
	Page, Limit int
	// Query matches the code, title or an actor's name.
	Query string
	// Chinese keeps movies whose video names mark Chinese subtitles.
	Chinese bool
	// Sort is added (default), release, code or rating.
	Sort string
	// Actor, Maker, Series and Tag match names exactly, so a person or label
	// from different sources is one filter.
	Actor, Maker, Series, Tag string
	Year                      int
	Collection                int
}

// chineseMarks are the name fragments that mark Chinese subtitles, as
// substrings SQLite can match: -C and -UC as organizing names them, and a
// ch glued to the code (pred-709ch.mp4) as many releases do.
var chineseMarks = []string{"-c.", "-c-", "-c_", "-c ", "_c.", "-uc.", "-uc-", "ch.", "-ch-", "中字", "中文字幕"}

func (s *Service) SearchMovies(ctx context.Context, filter MovieFilter) (Page, error) {
	page, limit := max(filter.Page, 1), filter.Limit
	result := Page{Movies: []Movie{}, Page: page, Source: s.Source()}
	scope := libraryScope(result.Source)
	where := []predicate.Movie{movie.HasFilesWith(scope)}
	if query := strings.TrimSpace(filter.Query); query != "" {
		where = append(where, movie.Or(movie.CodeContainsFold(query), movie.TitleContainsFold(query),
			movie.HasActorsWith(actor.Or(actor.NameContainsFold(query), actor.NameZhtContainsFold(query)))))
	}
	if filter.Chinese {
		marks := make([]predicate.File, len(chineseMarks))
		for i, mark := range chineseMarks {
			marks[i] = file.NameContainsFold(mark)
		}
		where = append(where, movie.HasFilesWith(scope, file.Or(marks...)))
	}
	if filter.Actor != "" {
		where = append(where, movie.HasActorsWith(actor.Or(actor.NameEQ(filter.Actor), actor.NameZhtEQ(filter.Actor))))
	}
	if filter.Maker != "" {
		where = append(where, movie.MakerNameEQ(filter.Maker))
	}
	if filter.Series != "" {
		where = append(where, movie.SeriesNameEQ(filter.Series))
	}
	if filter.Tag != "" {
		where = append(where, movie.HasTagsWith(tag.Or(tag.NameEQ(filter.Tag), tag.NameZhtEQ(filter.Tag))))
	}
	if filter.Year > 0 {
		start := time.Date(filter.Year, 1, 1, 0, 0, 0, 0, time.UTC)
		where = append(where, movie.ReleaseDateGTE(start), movie.ReleaseDateLT(start.AddDate(1, 0, 0)))
	}
	if filter.Collection > 0 {
		where = append(where, movie.HasCollectionItemsWith(collectionitem.CollectionIDEQ(filter.Collection)))
	}
	order := []movie.OrderOption{ent.Desc(movie.FieldCreatedAt), ent.Desc(movie.FieldID)}
	switch filter.Sort {
	case "release":
		order = []movie.OrderOption{ent.Desc(movie.FieldReleaseDate), ent.Desc(movie.FieldID)}
	case "code":
		order = []movie.OrderOption{ent.Asc(movie.FieldCode), ent.Asc(movie.FieldID)}
	case "rating":
		order = []movie.OrderOption{ent.Desc(movie.FieldRating), ent.Desc(movie.FieldID)}
	}
	var err error
	result.Total, err = s.database.Movie.Query().Where(where...).Count(ctx)
	if err != nil {
		return result, fmt.Errorf("count library index: %w", err)
	}
	if result.Total == 0 {
		return result, nil
	}
	records, err := s.database.Movie.Query().Where(where...).
		Select(movie.FieldID, movie.FieldCode, movie.FieldTitle, movie.FieldJavdbID, movie.FieldCover, movie.FieldPoster,
			movie.FieldFanarts, movie.FieldReleaseDate, movie.FieldDuration, movie.FieldRating,
			movie.FieldDirectorID, movie.FieldDirectorName, movie.FieldMakerID, movie.FieldMakerName,
			movie.FieldSeriesID, movie.FieldSeriesName,
			movie.FieldScrapeStatus).
		Order(order...).
		Offset((page - 1) * limit).Limit(limit).
		WithActors(func(query *ent.ActorQuery) {
			query.Select(actor.FieldID, actor.FieldProvider, actor.FieldSourceID, actor.FieldName).Order(ent.Asc(actor.FieldName), ent.Asc(actor.FieldID))
		}).
		WithTags(func(query *ent.TagQuery) {
			query.Select(tag.FieldID, tag.FieldProvider, tag.FieldSourceID, tag.FieldName).Order(ent.Asc(tag.FieldName), ent.Asc(tag.FieldID))
		}).
		WithFiles(func(query *ent.FileQuery) {
			query.Where(scope).Select(file.FieldID, file.FieldMovieID)
		}).All(ctx)
	if err != nil {
		return result, fmt.Errorf("list library movies: %w", err)
	}
	for _, record := range records {
		item := Movie{
			ID: record.ID, Code: record.Code, Title: record.Title,
			JavDBID: record.JavdbID, Cover: record.Cover, Poster: record.Poster,
			Duration: domain.ValueOrZero(record.Duration), Rating: domain.ValueOrZero(record.Rating),
			Director: libraryEntity(record.DirectorID, record.DirectorName),
			Maker:    libraryEntity(record.MakerID, record.MakerName), Series: libraryEntity(record.SeriesID, record.SeriesName),
			Actors: make([]Entity, 0, len(record.Edges.Actors)),
			Tags:   make([]Tag, 0, len(record.Edges.Tags)), ScrapeStatus: record.ScrapeStatus,
			FileCount: len(record.Edges.Files),
		}
		if record.ReleaseDate != nil {
			item.ReleaseDate = record.ReleaseDate.Format(time.DateOnly)
		}
		if len(record.Fanarts) > 0 {
			item.Fanart = record.Fanarts[0]
		}
		for _, person := range record.Edges.Actors {
			item.Actors = append(item.Actors, Entity{Provider: person.Provider, ID: person.SourceID, Name: person.Name})
		}
		for _, label := range record.Edges.Tags {
			item.Tags = append(item.Tags, Tag{ID: label.ID, Provider: label.Provider, SourceID: label.SourceID, Name: label.Name})
		}
		result.Movies = append(result.Movies, item)
	}
	result.HasMore = (page-1)*limit+len(result.Movies) < result.Total
	return result, nil
}

func libraryEntity(id, name *string) *Entity {
	if name == nil || *name == "" {
		return nil
	}
	return &Entity{ID: domain.ValueOrZero(id), Name: *name}
}

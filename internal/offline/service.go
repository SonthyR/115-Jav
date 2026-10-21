package offline

import (
	"context"
	"time"

	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/drive"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/tasks"
)

// ErrMagnetNotFound is returned when attempting to add a magnet hash that does not belong to the movie.
var ErrMagnetNotFound = domain.E(domain.KindInvalid, "磁力链不属于当前影片，请刷新后重试", nil)

// ErrNoPreferredMagnet is returned when no magnet of the movie meets the subscription preferences.
var ErrNoPreferredMagnet = domain.E(domain.KindInvalid, "没有符合偏好的磁力，请打开详情手动选择", nil)

// Catalogue supplies movie metadata and magnet availability verification.
type Catalogue interface {
	HasMagnet(ctx context.Context, movieID, hash string) (bool, error)
	MovieCode(ctx context.Context, movieID string) (string, error)
	CatalogueMagnets(ctx context.Context, movieID string) ([]domain.Magnet, error)
}

// Library schedules scans and projects their current workflow status.
type Library interface {
	Workflows(context.Context, []*ent.Task) ([]domain.TaskInfo, error)
	EnqueueTargetedScan(ctx context.Context, tx *ent.Tx, source domain.LibrarySource, targetID string, offlineTaskID int, code, javdbID string) (int, error)
}

// Placer organizes a finished download inside the library and returns the
// folder to scan instead. An error leaves the download where 115 saved it.
type Placer interface {
	Place(ctx context.Context, fileID, code string) (string, error)
}

// Service coordinates 115 offline download submissions, remote polling, and indexing transitions.
type Service struct {
	database  *ent.Client
	catalogue Catalogue
	drive     *drive.Drive
	tasks     *tasks.Service
	library   Library
	placer    Placer
	// submitTimeout bounds one remote submission once it has started; the
	// caller may have gone away but the mutation must be recorded.
	submitTimeout time.Duration
	operations    offlineOperations
	now           func() time.Time
	policy        recoveryPolicy
}

// SetPlacer organizes finished downloads before they are scanned.
func (service *Service) SetPlacer(placer Placer) { service.placer = placer }

// New creates a new offline download management service.
func New(database *ent.Client, catalogue Catalogue, drive *drive.Drive, tasks *tasks.Service, library Library, submitTimeout time.Duration) *Service {
	return &Service{
		database:  database,
		catalogue: catalogue,
		drive:     drive,
		tasks:     tasks,
		library:   library,

		submitTimeout: submitTimeout,
		now:           time.Now,
		policy: recoveryPolicy{
			zeroProgressTimeout: 15 * time.Minute,
			stalledTimeout:      30 * time.Minute,
			completionGrace:     60 * time.Minute,
			maxAttempts:         3,
		},
	}
}

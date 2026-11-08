package maintenance

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/ppxb/miyabi/internal/ent/metadatacache"
)

const (
	backupDirectory = "backups"
	backupPrefix    = "miyabi-"
	backupSuffix    = ".db"
	// KeptBackups is how many daily database copies stay on disk.
	KeptBackups = 7
)

// Backup is one daily database copy under the data directory.
type Backup struct {
	Name      string    `json:"name"`
	SizeBytes int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
}

// BackupWriter writes a consistent copy of the live database to path.
type BackupWriter func(ctx context.Context, path string) error

// Daily runs the once-a-day housekeeping: a database backup, expired metadata
// cache rows and unreferenced cached images. It is cheap to call often; each
// part only runs when a day has passed.
func (service *Service) Daily(ctx context.Context) error {
	var errs []error
	if err := service.backupToday(ctx, time.Now()); err != nil {
		errs = append(errs, err)
	}
	if time.Since(service.lastCleanup) < 24*time.Hour {
		return errors.Join(errs...)
	}
	removed, err := service.db.MetadataCache.Delete().Where(metadatacache.ExpiresAtLT(time.Now())).Exec(ctx)
	if err != nil {
		errs = append(errs, fmt.Errorf("remove expired metadata cache: %w", err))
	} else if removed > 0 {
		slog.InfoContext(ctx, "removed expired metadata cache", "rows", removed)
	}
	if _, err := service.ClearCache(ctx); err != nil && !errors.Is(err, ErrCacheBusy) {
		errs = append(errs, fmt.Errorf("prune image cache: %w", err))
	} else if err == nil {
		service.lastCleanup = time.Now()
	}
	return errors.Join(errs...)
}

func (service *Service) backupToday(ctx context.Context, now time.Time) error {
	if service.backup == nil {
		return nil
	}
	directory := filepath.Join(service.directory, backupDirectory)
	target := filepath.Join(directory, backupPrefix+now.Format("20060102")+backupSuffix)
	if _, err := os.Stat(target); err == nil {
		return nil
	}
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return fmt.Errorf("create backup directory: %w", err)
	}
	// VACUUM INTO refuses an existing file, so a half-written copy from an
	// interrupted run is cleared first.
	partial := target + ".partial"
	_ = os.Remove(partial)
	if err := service.backup(ctx, partial); err != nil {
		_ = os.Remove(partial)
		return fmt.Errorf("back up database: %w", err)
	}
	if err := os.Rename(partial, target); err != nil {
		return fmt.Errorf("publish database backup: %w", err)
	}
	slog.InfoContext(ctx, "database backed up", "path", target)
	backups, err := service.Backups()
	if err != nil {
		return err
	}
	for _, old := range backups[min(len(backups), KeptBackups):] {
		if err := os.Remove(filepath.Join(directory, old.Name)); err != nil {
			return fmt.Errorf("remove old backup: %w", err)
		}
	}
	return nil
}

// Backups lists the daily database copies, newest first.
func (service *Service) Backups() ([]Backup, error) {
	entries, err := os.ReadDir(filepath.Join(service.directory, backupDirectory))
	if os.IsNotExist(err) {
		return []Backup{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("list backups: %w", err)
	}
	backups := []Backup{}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasPrefix(name, backupPrefix) || !strings.HasSuffix(name, backupSuffix) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		backups = append(backups, Backup{Name: name, SizeBytes: info.Size(), CreatedAt: info.ModTime()})
	}
	// Names carry the date, so they sort chronologically.
	slices.SortFunc(backups, func(a, b Backup) int { return strings.Compare(b.Name, a.Name) })
	return backups, nil
}

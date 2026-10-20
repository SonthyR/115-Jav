package scan

import (
	"context"
	"errors"
	"log/slog"
	"slices"

	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/drive"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/file"
	"github.com/ppxb/miyabi/internal/ent/movie"
	"github.com/ppxb/miyabi/internal/pan"
)

// VideoLister lists the videos anywhere below a directory in a few requests.
type VideoLister interface {
	ListVideos(ctx context.Context, dirID string, offset, limit int) (pan.FilePage, error)
}

const (
	quickPageSize = 1000
	// Folders of missing videos are listed again, so a miss never drops a
	// file by itself; but a listing that misses this many indexed videos
	// (115 may classify some extensions differently) is cheaper to walk.
	quickMissingLimit = 0.2
	quickMissingFloor = 20
)

// quick replaces the full walk of a library scan when 115 can list every
// video below the media directory at once. Unchanged videos keep their index;
// only folders holding new, changed or missing videos are listed again.
// It reports false, before changing anything, when the walk must run instead.
func (r *scanRun) quick(ctx context.Context) (bool, error) {
	lister, ok := r.session.(VideoLister)
	if !ok {
		return false, nil
	}
	source := r.payload.Source
	listed, ok := r.listAllVideos(ctx, lister, source.Directory.ID)
	if !ok {
		return false, nil
	}
	known, err := r.scanner.db.File.Query().Where(database.LibraryFiles(source)).
		Select(file.FieldFileID, file.FieldName, file.FieldParentID, file.FieldSize, file.FieldSha1,
			file.FieldPickCode, file.FieldPath).All(ctx)
	if err != nil {
		return false, err
	}
	if len(listed) == 0 && len(known) > 0 {
		return false, nil
	}

	byID := make(map[string]*ent.File, len(known))
	for _, entry := range known {
		byID[entry.FileID] = entry
	}
	present := make(map[string]bool, len(listed))
	dirty := make(map[string]bool)
	var unchanged []string
	for _, video := range listed {
		present[video.ID] = true
		old := byID[video.ID]
		if old != nil && old.Name == video.Name && old.ParentID == video.ParentID && old.Size == video.Size &&
			old.Sha1 == video.SHA1 && old.PickCode == video.PickCode {
			unchanged = append(unchanged, video.ID)
			continue
		}
		dirty[video.ParentID] = true
	}
	missing := 0
	for _, entry := range known {
		if !present[entry.FileID] {
			missing++
			dirty[entry.ParentID] = true
		}
	}
	if missing > quickMissingFloor && float64(missing) > quickMissingLimit*float64(len(known)) {
		slog.WarnContext(ctx, "quick scan listing misses too many indexed videos; walking instead",
			"missing", missing, "indexed", len(known))
		return false, nil
	}

	for start := 0; start < len(unchanged); start += 500 {
		chunk := unchanged[start:min(start+500, len(unchanged))]
		if err := r.session.Commit(ctx, func(tx *ent.Tx) error {
			return tx.File.Update().Where(file.FileIDIn(chunk...)).SetScanID(r.payload.ScanID).Exec(ctx)
		}); err != nil {
			return true, err
		}
	}
	r.payload.Scan.FilesScanned = len(listed)
	r.payload.Scan.VideoFiles = len(unchanged)
	r.payload.Scan.MatchedFiles = len(unchanged)
	r.payload.Scan.DirectoriesDiscovered = len(dirty) + 1
	r.payload.Scan.DirectoriesScanned = 1

	r.seen = make(map[string]bool)
	r.codes = make(map[string]bool)
	ids := make([]string, 0, len(dirty))
	for id := range dirty {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	for _, id := range ids {
		directory, found, err := r.quickDirectory(ctx, id)
		if err != nil {
			return true, err
		}
		if !found {
			continue // gone or moved out; its files are stale now
		}
		r.payload.Scan.CurrentPath = directory.Path
		if err := ReportScan(ctx, r.scanner.db.Task, r.taskID, *r.payload, r.scanner.tasksSvc); err != nil {
			return true, err
		}
		progress := r.payload.Scan
		r.checkpointProgress = &progress
		err = r.indexDirectory(ctx, directory)
		r.checkpointProgress = nil
		if domain.IsKind(err, domain.KindConflict) {
			// Keep what the folder held last time rather than dropping it.
			slog.WarnContext(ctx, "quick scan kept a folder it could not index", "path", directory.Path, "error", err)
			if err := r.session.Commit(ctx, func(tx *ent.Tx) error {
				return tx.File.Update().Where(database.LibraryFiles(source), file.ParentIDEQ(id)).
					SetScanID(r.payload.ScanID).Exec(ctx)
			}); err != nil {
				return true, err
			}
			continue
		}
		if err != nil {
			return true, err
		}
	}

	codes, err := r.scanner.db.Movie.Query().Where(movie.HasFilesWith(file.ScanIDEQ(r.payload.ScanID))).
		Select(movie.FieldCode).Strings(ctx)
	if err != nil {
		return true, err
	}
	r.payload.Scan.Movies = len(codes)
	r.payload.Checkpoint = ""
	r.payload.Scan.Stage = "reconciling"
	r.payload.Scan.CurrentPath = source.Directory.Path
	if err := ReportScan(ctx, r.scanner.db.Task, r.taskID, *r.payload, r.scanner.tasksSvc); err != nil {
		return true, err
	}
	return true, r.reconcile(ctx)
}

// listAllVideos reads every page; a failed or inconsistent listing reports
// false so the scan falls back to the walk.
func (r *scanRun) listAllVideos(ctx context.Context, lister VideoLister, rootID string) ([]pan.File, bool) {
	var videos []pan.File
	seen := make(map[string]bool)
	for offset := 0; ; {
		if r.scanner.pace != nil {
			if err := r.scanner.pace(ctx); err != nil {
				return nil, false
			}
		}
		page, err := lister.ListVideos(ctx, rootID, offset, quickPageSize)
		if err != nil {
			if !errors.Is(err, errors.ErrUnsupported) {
				slog.WarnContext(ctx, "quick scan listing failed; walking instead", "error", err)
			}
			return nil, false
		}
		for _, video := range page.Files {
			if !seen[video.ID] {
				seen[video.ID] = true
				videos = append(videos, video)
			}
		}
		offset += len(page.Files)
		if !page.HasMore || len(page.Files) == 0 {
			if len(videos) != page.Total {
				slog.WarnContext(ctx, "quick scan listing changed while paging; walking instead",
					"listed", len(videos), "total", page.Total)
				return nil, false
			}
			return videos, true
		}
	}
}

// quickDirectory asks 115 for a folder's current path, which the index may
// not know or may hold under an old parent name.
func (r *scanRun) quickDirectory(ctx context.Context, id string) (Directory, bool, error) {
	if r.scanner.pace != nil {
		if err := r.scanner.pace(ctx); err != nil {
			return Directory{}, false, err
		}
	}
	info, err := drive.SourceInfo(ctx, r.session, id)
	if errors.Is(err, pan.ErrNotFound) || domain.IsKind(err, domain.KindNotFound) {
		return Directory{}, false, nil
	}
	if err != nil {
		return Directory{}, false, err
	}
	return Directory{ID: id, Path: drive.FilePath(info.Path, info.Name)}, true, nil
}

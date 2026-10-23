package organize

import (
	"context"
	"log/slog"
	"path"
	"regexp"
	"slices"
	"strings"

	"github.com/ppxb/miyabi/internal/actorname"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/drive"
	"github.com/ppxb/miyabi/internal/library/scrape"
	"github.com/ppxb/miyabi/internal/nfo"
	"github.com/ppxb/miyabi/internal/pan"
)

const (
	posterName = "poster.jpg"
	fanartName = "fanart.jpg"
	thumbName  = "thumb.jpg"
)

var partStem = regexp.MustCompile(`(?i)-cd[0-9]+$`)

// fileOpener opens account-wide 115 file operations; *drive.Drive satisfies it.
type fileOpener interface {
	OpenFiles(ctx context.Context) (*drive.Files, error)
}

// sidecarFiles is the subset of drive.Files that sidecar publishing uses.
type sidecarFiles interface {
	Upload(ctx context.Context, parentID, name string, body []byte) (pan.UploadedFile, error)
	Delete(ctx context.Context, fileIDs []string, parentID string) error
}

// Sidecars writes the library's NFO and artwork to 115 after miyabi publishes
// a movie, so the cloud copy matches {code}-C.nfo, poster.jpg, fanart.jpg and
// thumb.jpg. A directory that already has an NFO keeps it, unless a rebuild
// asks for every NFO to be rewritten.
type Sidecars struct {
	open func(ctx context.Context) (sidecarFiles, error)
}

func NewSidecars(opener fileOpener) *Sidecars {
	return &Sidecars{open: func(ctx context.Context) (sidecarFiles, error) { return opener.OpenFiles(ctx) }}
}

func (sidecars *Sidecars) PublishSidecars(ctx context.Context, directories []scrape.MovieDirectory, doc nfo.Movie, videos []pan.File, poster, fanart []byte, replace bool) {
	var files sidecarFiles
	for _, directory := range directories {
		uploads, stale := plannedSidecars(directory, doc, videos, poster, fanart, replace)
		if len(uploads) == 0 {
			continue
		}
		if files == nil {
			var err error
			if files, err = sidecars.open(ctx); err != nil {
				slog.WarnContext(ctx, "cannot write sidecars to 115", "code", doc.Code, "error", err)
				return
			}
		}
		// The old NFO goes to the recycle bin first so the new one keeps its name.
		if len(stale) > 0 {
			if err := files.Delete(ctx, stale, directory.ID); err != nil {
				slog.WarnContext(ctx, "failed to replace NFO on 115", "code", doc.Code, "error", err)
				continue
			}
		}
		for _, upload := range uploads {
			if _, err := files.Upload(ctx, directory.ID, upload.name, upload.body); err != nil {
				slog.WarnContext(ctx, "failed to write sidecar to 115", "code", doc.Code, "name", upload.name, "error", err)
				if ctx.Err() != nil {
					return
				}
			}
		}
	}
}

type sidecarUpload struct {
	name string
	body []byte
}

// plannedSidecars lists the missing sidecars for one 115 directory, and with
// replace the NFOs to remove before the new one is written. The NFO takes the
// name of the directory's first video without its part suffix, or the name of
// the NFO it replaces.
func plannedSidecars(directory scrape.MovieDirectory, doc nfo.Movie, videos []pan.File, poster, fanart []byte, replace bool) ([]sidecarUpload, []string) {
	present := make(map[string]bool)
	var stale []string
	nfoName := ""
	for _, entry := range directory.Files {
		name := strings.ToLower(entry.Name)
		if !entry.IsDirectory && path.Ext(name) == ".nfo" {
			if !replace {
				return nil, nil
			}
			stale = append(stale, entry.ID)
			nfoName = entry.Name
		}
		// poster.jpg in a folder shared by several movies would belong to none.
		if !entry.IsDirectory && domain.IsVideo(entry.Name) && entry.Size >= domain.MinVideoSize && !directory.VideoIDs[entry.ID] {
			return nil, nil
		}
		present[name] = true
	}
	var names []string
	for _, video := range videos {
		if directory.VideoIDs[video.ID] {
			names = append(names, video.Name)
		}
	}
	if len(names) == 0 {
		return nil, nil
	}
	slices.Sort(names)
	if nfoName == "" {
		nfoName = partStem.ReplaceAllString(strings.TrimSuffix(names[0], path.Ext(names[0])), "") + ".nfo"
	}
	body, err := sidecarNFO(doc, names)
	if err != nil {
		return nil, nil
	}
	uploads := []sidecarUpload{{name: nfoName, body: body}}
	for _, image := range []sidecarUpload{{posterName, poster}, {fanartName, fanart}, {thumbName, fanart}} {
		if len(image.body) > 0 && !present[image.name] {
			uploads = append(uploads, image)
		}
	}
	return uploads, stale
}

// sidecarNFO encodes the NFO kept next to a movie's videos on 115.
func sidecarNFO(doc nfo.Movie, videoNames []string) ([]byte, error) {
	doc.Thumbs = []nfo.Thumb{{Aspect: "poster", Path: posterName}}
	doc.Fanart = fanartName
	doc.Actors = actorname.Current().Rename(doc.Actors)
	return nfo.Encode(nfo.ForMediaServer(doc, videoNames))
}

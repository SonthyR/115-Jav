package organize

import (
	"context"
	"log/slog"
	"path"
	"regexp"
	"slices"
	"strings"

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
}

// Sidecars writes the library's NFO and artwork to 115 after miyabi publishes
// a movie, so the cloud copy matches {code}-C.nfo, poster.jpg, fanart.jpg and
// thumb.jpg. A directory that already has an NFO is left untouched.
type Sidecars struct {
	open func(ctx context.Context) (sidecarFiles, error)
}

func NewSidecars(opener fileOpener) *Sidecars {
	return &Sidecars{open: func(ctx context.Context) (sidecarFiles, error) { return opener.OpenFiles(ctx) }}
}

func (sidecars *Sidecars) PublishSidecars(ctx context.Context, directories []scrape.MovieDirectory, doc nfo.Movie, videos []pan.File, poster, fanart []byte) {
	var files sidecarFiles
	for _, directory := range directories {
		uploads := plannedSidecars(directory, doc, videos, poster, fanart)
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

// plannedSidecars lists the missing sidecars for one 115 directory. The NFO
// takes the name of the directory's first video without its part suffix.
func plannedSidecars(directory scrape.MovieDirectory, doc nfo.Movie, videos []pan.File, poster, fanart []byte) []sidecarUpload {
	present := make(map[string]bool)
	for _, entry := range directory.Files {
		name := strings.ToLower(entry.Name)
		if !entry.IsDirectory && path.Ext(name) == ".nfo" {
			return nil
		}
		// poster.jpg in a folder shared by several movies would belong to none.
		if !entry.IsDirectory && domain.IsVideo(entry.Name) && entry.Size >= domain.MinVideoSize && !directory.VideoIDs[entry.ID] {
			return nil
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
		return nil
	}
	slices.Sort(names)
	stem := partStem.ReplaceAllString(strings.TrimSuffix(names[0], path.Ext(names[0])), "")
	doc.Thumbs = []nfo.Thumb{{Aspect: "poster", Path: posterName}}
	doc.Fanart = fanartName
	body, err := nfo.Encode(doc)
	if err != nil {
		return nil
	}
	uploads := []sidecarUpload{{name: stem + ".nfo", body: body}}
	for _, image := range []sidecarUpload{{posterName, poster}, {fanartName, fanart}, {thumbName, fanart}} {
		if len(image.body) > 0 && !present[image.name] {
			uploads = append(uploads, image)
		}
	}
	return uploads
}

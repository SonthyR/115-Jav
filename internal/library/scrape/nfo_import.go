package scrape

import (
	"context"
	"log/slog"
	"path"
	"strings"
	"time"

	"github.com/ppxb/miyabi/internal/codeid"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/drive"
	mediaimage "github.com/ppxb/miyabi/internal/image"
	"github.com/ppxb/miyabi/internal/nfo"
	"github.com/ppxb/miyabi/internal/pan"
	"github.com/ppxb/miyabi/internal/tasks"
)

const (
	// NFOProvider marks metadata and artwork taken from sidecars beside the videos on 115.
	NFOProvider = "nfo"

	maxSidecarNFO   = 2 << 20
	maxSidecarImage = 20 << 20
)

// libraryNFO is metadata and artwork that another tool already stored on 115.
type libraryNFO struct {
	document       nfo.Movie
	poster, fanart []byte
}

// findLibraryNFO reads the movie's NFO and artwork from its 115 directory so a
// library organized by other tools keeps its metadata instead of being scraped
// again. Missing or unusable sidecars report false and leave scraping to run.
func (service *Service) findLibraryNFO(ctx context.Context, sess drive.Session, input *Payload) (libraryNFO, bool, error) {
	directories, err := service.Directories(ctx, sess, input.MetadataPayload)
	if err != nil {
		return libraryNFO{}, false, ctx.Err()
	}
	for _, directory := range directories {
		entry, found := matchSidecarNFO(input.Code, directory.Files)
		if !found {
			continue
		}
		body, err := sess.Read(ctx, entry.PickCode, maxSidecarNFO)
		if err != nil {
			if ctx.Err() != nil {
				return libraryNFO{}, false, ctx.Err()
			}
			slog.WarnContext(ctx, "failed to read 115 NFO", "name", entry.Name, "error", err)
			continue
		}
		doc, err := nfo.Decode(body)
		if err != nil || strings.TrimSpace(doc.Title) == "" {
			slog.WarnContext(ctx, "ignored unusable 115 NFO", "name", entry.Name, "error", err)
			continue
		}
		if code := codeid.Normalize(doc.Code); code != "" && !codeid.IsEquivalent(code, input.Code) {
			continue
		}
		doc.Code = input.Code
		normalizeImportedNFO(&doc)
		service.linkCatalogue(ctx, &doc)
		result := libraryNFO{document: doc}
		result.poster = service.readSidecarImage(ctx, sess, directory.Files, entry.Name, "poster")
		if len(result.poster) > 0 {
			result.fanart = service.readSidecarImage(ctx, sess, directory.Files, entry.Name, "fanart", "thumb")
		}
		return result, true, ctx.Err()
	}
	return libraryNFO{}, false, nil
}

// linkCatalogue adds the JavDB identity and preview images that NFOs from
// other tools usually lack, so the detail view keeps previews, magnets and
// related films. NFO fields are never replaced; a failed lookup only logs.
func (service *Service) linkCatalogue(ctx context.Context, doc *nfo.Movie) {
	result, err := service.metadata.Fallback(ctx, domain.MovieRef{Code: doc.Code, JavDBID: doc.JavDBID()})
	if err != nil {
		slog.WarnContext(ctx, "imported NFO has no JavDB link", "code", doc.Code, "error", err)
		return
	}
	if doc.JavDBID() == "" {
		for _, source := range result.Detail.Sources {
			if source.Provider == "javdb" && source.ID != "" {
				doc.IDs = append(doc.IDs, nfo.UniqueID{Type: "javdb", Value: source.ID})
				break
			}
		}
	}
	for _, image := range result.Images {
		if image.Role == "preview" {
			doc.Images = append(doc.Images, image)
		}
	}
}

// matchSidecarNFO prefers an NFO named after the code, including suffixed
// names such as ABP-123-C.nfo, then the sole NFO in the directory.
func matchSidecarNFO(code string, files []pan.File) (pan.File, bool) {
	var sole pan.File
	count := 0
	for _, entry := range files {
		if entry.IsDirectory || !strings.EqualFold(path.Ext(entry.Name), ".nfo") {
			continue
		}
		if candidate, ok := codeid.Parse(entry.Name); ok && codeid.IsEquivalent(candidate, code) {
			return entry, true
		}
		sole = entry
		count++
	}
	return sole, count == 1
}

// readSidecarImage looks for Kodi-style artwork names: poster.jpg, or the NFO
// stem with a role suffix such as ABP-123-C-poster.jpg.
func (service *Service) readSidecarImage(ctx context.Context, sess drive.Session, files []pan.File, nfoName string, roles ...string) []byte {
	stem := strings.TrimSuffix(nfoName, path.Ext(nfoName))
	for _, role := range roles {
		for _, entry := range files {
			name := strings.ToLower(entry.Name)
			base := strings.TrimSuffix(name, path.Ext(name))
			if entry.IsDirectory || !isImageName(name) || (base != role && base != strings.ToLower(stem)+"-"+role) {
				continue
			}
			body, err := sess.Read(ctx, entry.PickCode, maxSidecarImage)
			if err == nil && len(body) > 0 {
				return body
			}
			slog.WarnContext(ctx, "failed to read 115 artwork", "name", entry.Name, "error", err)
		}
	}
	return nil
}

func isImageName(name string) bool {
	switch path.Ext(name) {
	case ".jpg", ".jpeg", ".png", ".webp":
		return true
	}
	return false
}

// normalizeImportedNFO drops values other tools write in forms that the
// library schema rejects, so one odd field does not discard the whole NFO.
func normalizeImportedNFO(doc *nfo.Movie) {
	doc.Premiered = strings.TrimSpace(doc.Premiered)
	if len(doc.Premiered) > len(time.DateOnly) {
		doc.Premiered = doc.Premiered[:len(time.DateOnly)]
	}
	if _, err := time.Parse(time.DateOnly, doc.Premiered); err != nil {
		doc.Premiered = ""
	}
	if doc.Runtime < 0 {
		doc.Runtime = 0
	}
	if doc.Rating < 0 {
		doc.Rating = 0
	}
	if doc.FieldSources == nil {
		doc.FieldSources = make(map[string]string)
	}
	doc.FieldSources["metadata"] = NFOProvider
}

// checkpointImportedArtwork stores the 115 poster and fanart as-is. The poster
// role keeps later poster-version upgrades from recropping a user's artwork.
func (service *Service) checkpointImportedArtwork(ctx context.Context, taskID int, input *Payload, sidecar libraryNFO) error {
	if err := service.images.LockArtwork(ctx); err != nil {
		return err
	}
	defer service.images.UnlockArtwork()
	fanart := sidecar.fanart
	if len(fanart) == 0 {
		fanart = sidecar.poster
	}
	artwork, err := service.images.Restore(sidecar.poster, fanart)
	if err != nil {
		slog.WarnContext(ctx, "ignored undecodable 115 artwork", "code", input.Code, "error", err)
		return nil
	}
	input.Artwork = &artwork
	input.PosterVersion = mediaimage.PosterVersion
	input.Document.SelectedImage = domain.ImageCandidate{Provider: NFOProvider, Role: "poster"}
	input.Document.FieldSources["cover"] = NFOProvider
	encoded, err := tasks.EncodePayload(input)
	if err != nil {
		return err
	}
	return service.db.Task.UpdateOneID(taskID).SetPayload(encoded).Exec(ctx)
}

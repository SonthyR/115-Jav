package export

import (
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"

	"github.com/ppxb/miyabi/internal/codeid"
	"github.com/ppxb/miyabi/internal/nfo"
	"github.com/ppxb/miyabi/internal/pan"
)

// Exports mirror the movie's folder on 115 when it is known, such as
// <embyDir>/三上悠亚/PRED-709, and otherwise use <embyDir>/<prefix>/<code>.
// Both layouts keep one folder per code two levels below embyDir, so an
// existing export is found by its code whichever layout wrote it.

// MovieFolder is the folder that holds a movie's code folder on 115,
// relative to the media directory: 三上悠亚 for
// /After/三上悠亚/PRED-709/PRED-709-C.mp4 below /After. It is empty when the
// videos sit outside such a layout.
func MovieFolder(sourcePath, code string, videoPaths []string) string {
	if len(videoPaths) == 0 || sourcePath == "" {
		return ""
	}
	dir := path.Dir(videoPaths[0])
	if parsed, ok := codeid.Parse(path.Base(dir)); ok && codeid.IsEquivalent(parsed, code) {
		dir = path.Dir(dir)
	}
	root := strings.TrimSuffix(sourcePath, "/") + "/"
	if !strings.HasPrefix(dir+"/", root) {
		return ""
	}
	rel := strings.TrimPrefix(dir+"/", root)
	rel = strings.TrimSuffix(rel, "/")
	for _, segment := range strings.Split(rel, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return ""
		}
	}
	return rel
}

// MediaStem names a movie's NFO and STRM. A single video keeps its own name
// when it carries the code, so PRED-709-C.mp4 exports PRED-709-C.strm;
// multi-part movies use the code with -cdN.
func MediaStem(code string, videos []pan.File) string {
	if len(videos) == 1 {
		stem := strings.TrimSuffix(videos[0].Name, path.Ext(videos[0].Name))
		if parsed, ok := codeid.Parse(stem); ok && codeid.IsEquivalent(parsed, code) &&
			strings.HasPrefix(strings.ToUpper(stem), strings.ToUpper(nfo.FileStem(code))) && safeStem(stem) {
			return stem
		}
	}
	return nfo.FileStem(code)
}

func safeStem(stem string) bool {
	return stem != "." && stem != ".." && !strings.ContainsAny(stem, `/\`+"\x00")
}

func legacyMovieDir(embyDir, code string) string {
	return filepath.Join(embyDir, nfo.FileStem(codeid.Prefix(code)), nfo.FileStem(code))
}

func folderMovieDir(embyDir, folder, code string) string {
	return filepath.Join(embyDir, filepath.FromSlash(folder), nfo.FileStem(code))
}

// exportIndex maps an export root and code stem to the folder holding it.
var exportIndex = struct {
	sync.Mutex
	roots map[string]map[string]string
}{roots: make(map[string]map[string]string)}

// indexedMovieDir returns the existing export folder for a code, if any.
func indexedMovieDir(embyDir, code string) string {
	stem := nfo.FileStem(code)
	exportIndex.Lock()
	defer exportIndex.Unlock()
	dirs, ok := exportIndex.roots[embyDir]
	if !ok {
		dirs = scanExports(embyDir)
		exportIndex.roots[embyDir] = dirs
	}
	dir, ok := dirs[stem]
	if !ok {
		return ""
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		delete(dirs, stem)
		return ""
	}
	return dir
}

func rememberMovieDir(embyDir, code, dir string) {
	exportIndex.Lock()
	defer exportIndex.Unlock()
	if dirs, ok := exportIndex.roots[embyDir]; ok {
		dirs[nfo.FileStem(code)] = dir
	}
}

// scanExports lists the folders two levels below embyDir. The first layout
// wins when one code somehow appears twice.
func scanExports(embyDir string) map[string]string {
	dirs := make(map[string]string)
	parents, err := os.ReadDir(embyDir)
	if err != nil {
		return dirs
	}
	for _, parent := range parents {
		if !parent.IsDir() {
			continue
		}
		children, err := os.ReadDir(filepath.Join(embyDir, parent.Name()))
		if err != nil {
			continue
		}
		for _, child := range children {
			if _, taken := dirs[child.Name()]; child.IsDir() && !taken {
				dirs[child.Name()] = filepath.Join(embyDir, parent.Name(), child.Name())
			}
		}
	}
	return dirs
}

// moveExport moves an existing export into the folder layout. It reports the
// directory to write to.
func moveExport(embyDir, folder, code string) (string, error) {
	existing := indexedMovieDir(embyDir, code)
	if folder == "" {
		if existing != "" {
			return existing, nil
		}
		return legacyMovieDir(embyDir, code), nil
	}
	target := folderMovieDir(embyDir, folder, code)
	if existing == "" || existing == target {
		return target, nil
	}
	if _, err := os.Stat(target); err == nil {
		// Both exist; write the new layout and drop the old copy.
		if err := os.RemoveAll(existing); err != nil {
			return "", err
		}
	} else {
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return "", err
		}
		if err := os.Rename(existing, target); err != nil {
			return "", err
		}
	}
	_ = os.Remove(filepath.Dir(existing)) // Keep non-empty parent folders.
	return target, nil
}

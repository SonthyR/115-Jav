//go:build !dev

package miyabi

import (
	"embed"
	"io/fs"
)

// all: keeps Vite chunks named after pathless routes, such as _watch-<hash>.js,
// which a plain pattern drops for starting with an underscore.
//
//go:embed all:web/dist
var embeddedFrontend embed.FS

func Frontend() fs.FS {
	frontend, err := fs.Sub(embeddedFrontend, "web/dist")
	if err != nil {
		panic(err)
	}
	return frontend
}

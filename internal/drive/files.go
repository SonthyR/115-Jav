package drive

import (
	"context"
	"fmt"

	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/pan"
)

// FileClient is the part of the 115 client that changes files. It is optional
// so read-only clients and test stubs need not implement it.
type FileClient interface {
	Mkdir(ctx context.Context, token, parentID, name string) (string, error)
	Move(ctx context.Context, token string, fileIDs []string, targetID string) error
	Rename(ctx context.Context, token, fileID, name string) error
	Delete(ctx context.Context, token string, fileIDs []string, parentID string) error
	Upload(ctx context.Context, token, parentID, name string, body []byte) (pan.UploadedFile, error)
}

// Files changes files anywhere in the logged-in account, including folders
// outside the media directory such as an organizing inbox.
type Files struct {
	drive  *Drive
	client FileClient
	state  snapshot
}

// OpenFiles requires a verified login. The media directory must be mounted
// because organized files are published into it.
func (d *Drive) OpenFiles(ctx context.Context) (*Files, error) {
	client, ok := d.client.(FileClient)
	if !ok {
		return nil, fmt.Errorf("115 client cannot change files")
	}
	state, err := d.verifiedSource(ctx)
	if err != nil {
		return nil, err
	}
	return &Files{drive: d, client: client, state: state}, nil
}

// MediaDirectory is the mounted media directory when Files was opened.
func (files *Files) MediaDirectory() domain.LibraryDirectory {
	return files.state.directory.LibraryDirectory
}

// Source is the mounted library when Files was opened.
func (files *Files) Source() domain.LibrarySource {
	return files.state.source()
}

// Entries reads every page of a directory.
func (files *Files) Entries(ctx context.Context, dirID string) ([]pan.File, error) {
	var entries []pan.File
	err := WalkFilePages(ctx, func(offset int) (pan.FilePage, error) {
		return files.List(ctx, dirID, offset)
	}, func(page pan.FilePage) (bool, error) {
		entries = append(entries, page.Files...)
		return true, nil
	})
	return entries, err
}

func fileRequest[T any](ctx context.Context, files *Files, request func(string) (T, error)) (T, error) {
	return withPanToken(ctx, files.drive, files.state, func(current snapshot) (T, error) {
		return request(current.tokens.AccessToken)
	})
}

// List reads one page of a directory, as Session.List does for the mount.
func (files *Files) List(ctx context.Context, dirID string, offset int) (pan.FilePage, error) {
	return fileRequest(ctx, files, func(token string) (pan.FilePage, error) {
		return files.drive.client.List(ctx, token, dirID, offset, 100)
	})
}

// Read downloads a small file such as an NFO by its pick code.
func (files *Files) Read(ctx context.Context, pickCode string, limit int64) ([]byte, error) {
	return fileRequest(ctx, files, func(token string) ([]byte, error) {
		return files.drive.client.ReadMetadata(ctx, token, pickCode, limit)
	})
}

func (files *Files) Mkdir(ctx context.Context, parentID, name string) (string, error) {
	return fileRequest(ctx, files, func(token string) (string, error) {
		return files.client.Mkdir(ctx, token, parentID, name)
	})
}

func (files *Files) Move(ctx context.Context, fileIDs []string, targetID string) error {
	_, err := fileRequest(ctx, files, func(token string) (struct{}, error) {
		return struct{}{}, files.client.Move(ctx, token, fileIDs, targetID)
	})
	return err
}

func (files *Files) Rename(ctx context.Context, fileID, name string) error {
	_, err := fileRequest(ctx, files, func(token string) (struct{}, error) {
		return struct{}{}, files.client.Rename(ctx, token, fileID, name)
	})
	return err
}

// Delete moves files to the 115 recycle bin; it never purges them.
func (files *Files) Delete(ctx context.Context, fileIDs []string, parentID string) error {
	_, err := fileRequest(ctx, files, func(token string) (struct{}, error) {
		return struct{}{}, files.client.Delete(ctx, token, fileIDs, parentID)
	})
	return err
}

func (files *Files) Upload(ctx context.Context, parentID, name string, body []byte) (pan.UploadedFile, error) {
	return fileRequest(ctx, files, func(token string) (pan.UploadedFile, error) {
		return files.client.Upload(ctx, token, parentID, name, body)
	})
}

type videoLister interface {
	ListVideos(ctx context.Context, token, directoryID string, offset, limit int) (pan.FilePage, error)
}

// ListVideos reads one page of the videos anywhere below a directory.
func (files *Files) ListVideos(ctx context.Context, dirID string, offset, limit int) (pan.FilePage, error) {
	lister, ok := files.drive.client.(videoLister)
	if !ok {
		return pan.FilePage{}, fmt.Errorf("115 client cannot list videos recursively")
	}
	return fileRequest(ctx, files, func(token string) (pan.FilePage, error) {
		return lister.ListVideos(ctx, token, dirID, offset, limit)
	})
}

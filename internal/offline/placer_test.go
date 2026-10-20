package offline

import (
	"context"
	"errors"
	"testing"

	"github.com/ppxb/miyabi/internal/pan"
)

type placerFunc func(ctx context.Context, fileID, code string) (string, error)

func (f placerFunc) Place(ctx context.Context, fileID, code string) (string, error) {
	return f(ctx, fileID, code)
}

func TestOfflineCompletionScansThePlacedFolder(t *testing.T) {
	for _, tc := range []struct {
		name   string
		placed string
		err    error
		want   string
	}{
		{"organized", "code-folder", nil, "code-folder"},
		{"left in place", "", errors.New("no rule"), "download-folder"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service, record, input, _ := offlineFixture(t)
			calls := 0
			service.SetPlacer(placerFunc(func(_ context.Context, fileID, code string) (string, error) {
				calls++
				if fileID != "download-folder" || code != input.Code {
					t.Errorf("Place(%s, %s)", fileID, code)
				}
				return tc.placed, tc.err
			}))
			stubOf(t, service.drive).offlineTasks = func(context.Context, string, int) (pan.OfflinePage, error) {
				return pan.OfflinePage{PageCount: 1, Tasks: []pan.OfflineTask{
					{Hash: input.InfoHash, Status: 2, Progress: 100, FileID: "download-folder"},
				}}, nil
			}
			for range 2 {
				if err := service.Sync(t.Context()); err != nil {
					t.Fatal(err)
				}
			}
			current := service.database.OfflineDownload.GetX(t.Context(), record.ID)
			if current.FileID != tc.want || current.ScanTaskID == 0 || calls != 1 {
				t.Fatalf("file %q, scan %d, calls %d", current.FileID, current.ScanTaskID, calls)
			}
		})
	}
}

package organize

import (
	"slices"
	"testing"

	"github.com/ppxb/miyabi/internal/domain"
)

func TestRetryOrganizesAFailedReleaseUnderTheGivenCode(t *testing.T) {
	h := newHarness(t, fakeResolver{"SSIS-123": {{Name: "河北彩花"}}}, nil)
	release := h.files.dir(h.inbox, "神秘影片 第一部")
	h.files.add(release, "movie.mp4", 2*gb)
	h.poll(t)
	if got := h.files.paths(h.failed); !slices.Equal(got, []string{"神秘影片 第一部/movie.mp4"}) {
		t.Fatalf("failed folder = %v", got)
	}

	failed, err := h.service.Failed(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if len(failed) != 1 || failed[0].Name != "神秘影片 第一部" || failed[0].Reason == "" || failed[0].Code != "" {
		t.Fatalf("failed = %+v", failed)
	}

	// A code nobody knows fails again and leaves the release in place.
	entry, err := h.service.Retry(t.Context(), "神秘影片 第一部", "ABC-999")
	if err != nil || entry.Status != "failed" {
		t.Fatalf("retry = %+v, %v", entry, err)
	}
	if got := h.files.paths(h.failed); len(got) != 1 {
		t.Fatalf("release left the failed folder: %v", got)
	}

	entry, err = h.service.Retry(t.Context(), "神秘影片 第一部", "ssis123")
	if err != nil || entry.Status != "done" || entry.Code != "SSIS-123" {
		t.Fatalf("retry = %+v, %v", entry, err)
	}
	if got := h.files.paths("lib"); !slices.Contains(got, "河北彩花/SSIS-123/SSIS-123.mp4") {
		t.Fatalf("library = %v", got)
	}
	if got := h.files.paths(h.failed); len(got) != 0 {
		t.Fatalf("failed folder still has %v", got)
	}
	if len(h.scanner.targets) != 1 {
		t.Fatalf("scans = %v", h.scanner.targets)
	}

	if _, err := h.service.Retry(t.Context(), "神秘影片 第一部", "SSIS-123"); !domain.IsKind(err, domain.KindNotFound) {
		t.Fatalf("retrying a missing release = %v", err)
	}
	if _, err := h.service.Retry(t.Context(), "x", " "); !domain.IsKind(err, domain.KindInvalid) {
		t.Fatalf("empty code = %v", err)
	}
}

package maintenance

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ppxb/miyabi/internal/ent/metadatacache"
)

func TestDailyBacksUpOncePerDayAndKeepsAWeek(t *testing.T) {
	service := dataFixture(t)
	directory := filepath.Join(service.directory, backupDirectory)
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatal(err)
	}
	for day := 1; day <= KeptBackups+2; day++ {
		name := filepath.Join(directory, backupPrefix+time.Date(2020, 1, day, 0, 0, 0, 0, time.UTC).Format("20060102")+backupSuffix)
		if err := os.WriteFile(name, []byte("old"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now()
	if err := service.backupToday(t.Context(), now); err != nil {
		t.Fatal(err)
	}
	if err := service.backupToday(t.Context(), now); err != nil {
		t.Fatalf("a second run on the same day must be a no-op: %v", err)
	}
	backups, err := service.Backups()
	if err != nil || len(backups) != KeptBackups || backups[0].Name != backupPrefix+now.Format("20060102")+backupSuffix || backups[0].SizeBytes == 0 {
		t.Fatalf("backups = %+v, %v", backups, err)
	}
}

func TestDailyRemovesExpiredMetadataCache(t *testing.T) {
	service := dataFixture(t)
	ctx := t.Context()
	service.db.MetadataCache.Create().SetProvider("javdb").SetCode("OLD-001").SetExpiresAt(time.Now().Add(-time.Hour)).ExecX(ctx)
	service.db.MetadataCache.Create().SetProvider("javdb").SetCode("NEW-001").SetExpiresAt(time.Now().Add(time.Hour)).ExecX(ctx)
	service.lastCleanup = time.Time{}
	if err := service.Daily(ctx); err != nil {
		t.Fatal(err)
	}
	codes := service.db.MetadataCache.Query().Select(metadatacache.FieldCode).StringsX(ctx)
	if len(codes) != 1 || codes[0] != "NEW-001" {
		t.Fatalf("remaining cache = %v", codes)
	}
}

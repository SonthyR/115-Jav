package database

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/ppxb/miyabi/internal/ent"
	_ "github.com/ppxb/miyabi/internal/ent/runtime" // Initialize schema hooks and defaults.
	_ "modernc.org/sqlite"
)

type Store struct {
	Client *ent.Client
	db     *sql.DB
}

func Open(ctx context.Context, dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}

	databasePath, err := filepath.Abs(filepath.Join(dataDir, "miyabi.db"))
	if err != nil {
		return nil, fmt.Errorf("resolve database path: %w", err)
	}

	db, err := sql.Open("sqlite", sqliteDSN(databasePath))
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping sqlite database: %w", err)
	}

	driver := entsql.OpenDB(dialect.SQLite, db)
	opts := []ent.Option{
		ent.Driver(driver),
		ent.Log(func(args ...any) {
			slog.Debug(withoutQueryArgs(fmt.Sprint(args...)))
		}),
	}
	if slog.Default().Enabled(ctx, slog.LevelDebug) {
		opts = append(opts, ent.Debug())
	}
	client := ent.NewClient(opts...)
	if err := client.Schema.Create(ctx); err != nil {
		client.Close()
		return nil, fmt.Errorf("initialize database schema: %w", err)
	}
	if err := createTaskIndexes(ctx, db); err != nil {
		client.Close()
		return nil, fmt.Errorf("initialize database indexes: %w", err)
	}

	return &Store{Client: client, db: db}, nil
}

// Backup writes a consistent copy of the live database to path, which must
// not exist yet.
func (store *Store) Backup(ctx context.Context, path string) error {
	_, err := store.db.ExecContext(ctx, "VACUUM INTO ?", path)
	return err
}

func (store *Store) Close() error {
	return store.Client.Close()
}

func sqliteDSN(databasePath string) string {
	path := filepath.ToSlash(databasePath)
	if volume := filepath.VolumeName(databasePath); volume != "" {
		path = "/" + path
	}

	uri := url.URL{Scheme: "file", Path: path}
	query := uri.Query()
	query.Add("_pragma", "busy_timeout(5000)")
	query.Add("_pragma", "foreign_keys(1)")
	query.Add("_pragma", "journal_mode(WAL)")
	// With WAL, NORMAL keeps the database consistent and only risks the last
	// commits on power loss; a larger page cache keeps listings in memory.
	query.Add("_pragma", "synchronous(NORMAL)")
	query.Add("_pragma", "cache_size(-32000)")
	// Reserve the writer before a transaction reads. Scan transactions and
	// offline task updates must not race while upgrading a WAL read snapshot.
	query.Set("_txlock", "immediate")
	uri.RawQuery = query.Encode()
	return uri.String()
}

// withoutQueryArgs drops the bound values from an Ent debug line. Settings rows
// carry 115 tokens and other credentials, which must not reach the logs.
func withoutQueryArgs(line string) string {
	if index := strings.Index(line, " args="); index >= 0 {
		return line[:index]
	}
	return line
}

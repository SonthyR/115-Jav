package actoralias

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"sync"
	"time"

	"github.com/ppxb/miyabi/internal/codeid"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/actor"
	"github.com/ppxb/miyabi/internal/ent/metadatacache"
)

// Unresolved maps the library actresses tied to no JavDB actor, neither by a
// JavDB record of their own nor by a pairing, to the codes of their films.
func (i *Index) Unresolved(ctx context.Context) (map[string][]string, error) {
	aliases := i.Aliases(ctx)
	movies, err := i.db.Movie.Query().
		WithActors(func(query *ent.ActorQuery) {
			query.Where(actor.GenderNEQ(actor.GenderMale)).Select(actor.FieldID, actor.FieldProvider, actor.FieldName)
		}).All(ctx)
	if err != nil {
		return nil, err
	}
	linked := map[string]bool{}
	for _, record := range movies {
		for _, person := range record.Edges.Actors {
			if person.Provider == "javdb" {
				linked[person.Name] = true
			}
		}
	}
	unresolved := map[string][]string{}
	for _, record := range movies {
		code := codeid.Normalize(record.Code)
		for _, person := range record.Edges.Actors {
			if _, ok := aliases[person.Name]; ok || linked[person.Name] {
				continue
			}
			if !slices.Contains(unresolved[person.Name], code) {
				unresolved[person.Name] = append(unresolved[person.Name], code)
			}
		}
	}
	return unresolved, nil
}

// LinkStatus reports a run that fetches JavDB details for the films of
// unresolved actresses, so their names can be paired.
type LinkStatus struct {
	Running    bool   `json:"running"`
	Total      int    `json:"total"`
	Done       int    `json:"done"`
	Failed     int    `json:"failed"`
	Unresolved int    `json:"unresolved"`
	Error      string `json:"error,omitempty"`
}

// Linker fills the metadata cache with the JavDB entries pairing needs.
type Linker struct {
	index *Index
	fetch func(context.Context, string) error
	// pause spaces the lookups so a large library does not hammer JavDB.
	pause time.Duration

	mu     sync.Mutex
	status LinkStatus
}

// NewLinker fetches a film's JavDB entry into the metadata cache with fetch.
func NewLinker(index *Index, fetch func(context.Context, string) error) *Linker {
	return &Linker{index: index, fetch: fetch, pause: 2 * time.Second}
}

func (l *Linker) Status(ctx context.Context) (LinkStatus, error) {
	l.mu.Lock()
	status := l.status
	l.mu.Unlock()
	if status.Running {
		return status, nil
	}
	unresolved, err := l.index.Unresolved(ctx)
	status.Unresolved = len(unresolved)
	return status, err
}

// Start fetches the films not yet looked up on JavDB in the background.
func (l *Linker) Start(ctx context.Context) (LinkStatus, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.status.Running {
		return l.status, nil
	}
	unresolved, err := l.index.Unresolved(ctx)
	if err != nil {
		return l.status, err
	}
	// Misses are looked up again once their cache entry expires.
	looked, err := l.index.db.MetadataCache.Query().Where(metadatacache.ProviderEQ("javdb"),
		metadatacache.Or(metadatacache.ResultNotNil(), metadatacache.ExpiresAtGT(time.Now()))).
		Select(metadatacache.FieldCode).Strings(ctx)
	if err != nil {
		return l.status, err
	}
	var codes []string
	for _, films := range unresolved {
		for _, code := range films {
			if !slices.Contains(looked, code) && !slices.Contains(codes, code) {
				codes = append(codes, code)
			}
		}
	}
	slices.Sort(codes)
	l.status = LinkStatus{Running: len(codes) > 0, Total: len(codes), Unresolved: len(unresolved)}
	if len(codes) > 0 {
		go l.run(context.WithoutCancel(ctx), codes)
	}
	return l.status, nil
}

func (l *Linker) run(ctx context.Context, codes []string) {
	var failure error
	for index, code := range codes {
		if index > 0 && l.pause > 0 {
			time.Sleep(l.pause)
		}
		err := l.fetch(ctx, code)
		if err != nil {
			slog.WarnContext(ctx, "fetch JavDB details for actor pairing", "code", code, "error", err)
			failure = err
		}
		l.mu.Lock()
		l.status.Done++
		if err != nil {
			l.status.Failed++
		}
		l.mu.Unlock()
		if index%20 == 19 {
			Invalidate()
		}
		if errors.Is(err, context.Canceled) {
			break
		}
	}
	Invalidate()
	unresolved, err := l.index.Unresolved(ctx)
	l.mu.Lock()
	defer l.mu.Unlock()
	l.status.Running = false
	if err == nil {
		l.status.Unresolved = len(unresolved)
	}
	if failure != nil && l.status.Failed == l.status.Total {
		l.status.Error = failure.Error()
	}
}

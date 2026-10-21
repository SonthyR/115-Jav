package organize

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/ppxb/miyabi/internal/actorname"
	"github.com/ppxb/miyabi/internal/codeid"
	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/drive"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/pan"
)

const (
	configSetting = "organize.config"
	logSetting    = "organize.log"
	maxLogEntries = 300
	// maxItemDepth bounds how deep a release folder in the inbox is searched.
	maxItemDepth = 3
)

// Folder is a 115 directory chosen in the settings page.
type Folder struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

// Rule moves releases from Source into the mounted media directory. Releases
// that cannot be identified or scraped go to Failed when it is set.
type Rule struct {
	Enabled bool   `json:"enabled"`
	DryRun  bool   `json:"dry_run"`
	Source  Folder `json:"source"`
	Failed  Folder `json:"failed"`
}

type Config struct {
	Rules      []Rule `json:"rules"`
	MaxActors  int    `json:"max_actors"`
	MinVideoMB int    `json:"min_video_mb"`
	CleanJunk  bool   `json:"clean_junk"`
}

func DefaultConfig() Config {
	return Config{MaxActors: DefaultMaxActors, MinVideoMB: 200, CleanJunk: true}
}

func (cfg Config) normalized() Config {
	if cfg.MaxActors <= 0 {
		cfg.MaxActors = DefaultMaxActors
	}
	if cfg.MinVideoMB <= 0 {
		cfg.MinVideoMB = DefaultConfig().MinVideoMB
	}
	return cfg
}

// Entry is one line of the organizing log shown in the settings page.
type Entry struct {
	Time   time.Time `json:"time"`
	Source string    `json:"source"`
	Code   string    `json:"code,omitempty"`
	Target string    `json:"target,omitempty"`
	Status string    `json:"status"` // done, dry_run, failed or info
	Detail string    `json:"detail,omitempty"`
}

// Files is the 115 access the organizer needs; *drive.Files implements it.
type Files interface {
	Source() domain.LibrarySource
	Entries(ctx context.Context, dirID string) ([]pan.File, error)
	Mkdir(ctx context.Context, parentID, name string) (string, error)
	Move(ctx context.Context, fileIDs []string, targetID string) error
	Rename(ctx context.Context, fileID, name string) error
	Delete(ctx context.Context, fileIDs []string, parentID string) error
	Upload(ctx context.Context, parentID, name string, body []byte) (pan.UploadedFile, error)
}

// Resolver looks up a code's metadata; the metadata service caches it, so the
// scrape that follows organizing does not query the sources again.
type Resolver interface {
	Resolve(context.Context, domain.MovieRef) (domain.MovieMetadata, error)
}

// Scanner indexes an organized movie folder so miyabi scrapes and exports it.
type Scanner interface {
	EnqueueTargetedScan(ctx context.Context, tx *ent.Tx, source domain.LibrarySource, targetID string, offlineTaskID int, code, javdbID string) (int, error)
}

type Service struct {
	db       *ent.Client
	open     func(context.Context) (Files, error)
	metadata Resolver
	scanner  Scanner
	wake     func()
	sync     func(context.Context) error

	running sync.Mutex
	mu      sync.Mutex
	// sizes remembers each pending item's video sizes from the previous poll;
	// an item is organized only once they stop changing.
	sizes map[string]string
	// failed holds items already reported, so each failure is logged once.
	failed map[string]string
}

func New(db *ent.Client, d *drive.Drive, metadata Resolver, scanner Scanner, wake func()) *Service {
	return &Service{
		db: db, metadata: metadata, scanner: scanner, wake: wake,
		open:  func(ctx context.Context) (Files, error) { return d.OpenFiles(ctx) },
		sizes: make(map[string]string), failed: make(map[string]string),
	}
}

func (s *Service) Config(ctx context.Context) (Config, error) {
	cfg, found, err := database.LoadSetting[Config](ctx, s.db, configSetting)
	if err != nil || !found {
		return DefaultConfig(), err
	}
	return cfg.normalized(), nil
}

func (s *Service) UpdateConfig(ctx context.Context, cfg Config) (Config, error) {
	cfg = cfg.normalized()
	for _, rule := range cfg.Rules {
		if rule.Source.ID == "" {
			return Config{}, domain.E(domain.KindInvalid, "请选择整理前目录", nil)
		}
		if rule.Failed.ID != "" && rule.Failed.ID == rule.Source.ID {
			return Config{}, domain.E(domain.KindInvalid, "失败目录不能和整理前目录相同", nil)
		}
	}
	if err := database.SaveSetting(ctx, s.db, configSetting, cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// Log returns the newest entries first.
func (s *Service) Log(ctx context.Context) ([]Entry, error) {
	entries, _, err := database.LoadSetting[[]Entry](ctx, s.db, logSetting)
	slices.Reverse(entries)
	return entries, err
}

func (s *Service) record(ctx context.Context, entry Entry) {
	entry.Time = time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, _, err := database.LoadSetting[[]Entry](ctx, s.db, logSetting)
	if err == nil {
		entries = append(entries, entry)
		if len(entries) > maxLogEntries {
			entries = entries[len(entries)-maxLogEntries:]
		}
		err = database.SaveSetting(ctx, s.db, logSetting, entries)
	}
	if err != nil {
		slog.WarnContext(ctx, "failed to save organize log", "error", err)
	}
}

// Run polls every enabled rule once. It is safe to call from a timer; a run
// already in progress makes later calls return immediately.
func (s *Service) Run(ctx context.Context) error {
	if !s.running.TryLock() {
		return nil
	}
	defer s.running.Unlock()
	_, err := s.poll(ctx)
	if errors.Is(err, errNoRules) {
		return nil
	}
	return err
}

var errNoRules = errors.New("没有启用的整理规则")

// summary counts what one poll saw, for the manual run's closing log line.
type summary struct {
	entries, skipped, noVideo, waiting, handled int
}

func (s *Service) poll(ctx context.Context) (*summary, error) {
	cfg, err := s.Config(ctx)
	if err != nil {
		return nil, err
	}
	if !slices.ContainsFunc(cfg.Rules, func(rule Rule) bool { return rule.Enabled }) {
		return nil, errNoRules
	}
	files, err := s.open(ctx)
	if err != nil {
		if errors.Is(err, drive.ErrMediaDirectoryRequired) {
			return nil, nil
		}
		return nil, err
	}
	run := &run{service: s, files: files, cfg: cfg, summary: &summary{}}
	for _, rule := range cfg.Rules {
		if !rule.Enabled {
			continue
		}
		if err := run.rule(ctx, rule); err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			slog.WarnContext(ctx, "organize rule failed", "source", rule.Source.Path, "error", err)
			s.record(ctx, Entry{Source: rule.Source.Path, Status: "failed", Detail: "读取整理前目录失败：" + err.Error()})
		}
	}
	return run.summary, nil
}

// settleDelay separates the two polls of a manual run, so new releases do
// not wait for the next periodic poll to prove their sizes are stable.
const settleDelay = 15 * time.Second

// Trigger polls twice in the background, settleDelay apart. Unlike the
// periodic Run it waits for a poll already in progress instead of skipping.
func (s *Service) Trigger(ctx context.Context) {
	ctx = context.WithoutCancel(ctx)
	go func() {
		var last *summary
		for pass := range 2 {
			if pass > 0 {
				time.Sleep(settleDelay)
			}
			s.running.Lock()
			result, err := s.poll(ctx)
			s.running.Unlock()
			if err != nil {
				slog.WarnContext(ctx, "organize run failed", "error", err)
				s.record(ctx, Entry{Status: "failed", Detail: "整理失败：" + err.Error()})
				return
			}
			last = result
		}
		if last == nil {
			s.record(ctx, Entry{Status: "info", Detail: "还没有挂载媒体目录，没有整理"})
			return
		}
		s.record(ctx, Entry{Status: "info", Detail: fmt.Sprintf(
			"立即整理完成：整理前目录有 %d 项，处理 %d 项，跳过 %d 项（_ 开头），%d 项没有达到大小的视频，%d 项还在传输中",
			last.entries, last.handled, last.skipped, last.noVideo, last.waiting)})
	}()
}

type run struct {
	service *Service
	files   Files
	cfg     Config
	// actorDirs caches the library root listing for one run.
	actorDirs []pan.File
	listed    bool
	summary   *summary
}

func (r *run) rule(ctx context.Context, rule Rule) error {
	entries, err := r.files.Entries(ctx, rule.Source.ID)
	if err != nil {
		return err
	}
	seen := make(map[string]bool, len(entries))
	for _, entry := range entries {
		seen[entry.ID] = true
		if err := r.item(ctx, rule, entry); err != nil && ctx.Err() != nil {
			return err
		}
	}
	r.service.mu.Lock()
	for id := range r.service.sizes {
		if !seen[id] {
			delete(r.service.sizes, id)
		}
	}
	r.service.mu.Unlock()
	return nil
}

// release is one inbox entry: a loose video or a folder with its contents.
type release struct {
	entry     pan.File
	videos    []pan.File
	subtitles []pan.File
}

func (r *run) collect(ctx context.Context, entry pan.File) (release, error) {
	item := release{entry: entry}
	minSize := int64(r.cfg.MinVideoMB) << 20
	add := func(file pan.File) {
		switch {
		case domain.IsVideo(file.Name) && file.Size >= minSize:
			item.videos = append(item.videos, file)
		case domain.IsSubtitle(file.Name):
			item.subtitles = append(item.subtitles, file)
		}
	}
	if !entry.IsDirectory {
		add(entry)
		return item, nil
	}
	var walk func(id string, depth int) error
	walk = func(id string, depth int) error {
		children, err := r.files.Entries(ctx, id)
		if err != nil {
			return err
		}
		for _, child := range children {
			if child.IsDirectory {
				if depth < maxItemDepth {
					if err := walk(child.ID, depth+1); err != nil {
						return err
					}
				}
				continue
			}
			add(child)
		}
		return nil
	}
	err := walk(entry.ID, 1)
	return item, err
}

// stable reports whether the item's videos are unchanged since the last poll.
func (r *run) stable(item release) bool {
	var fingerprint strings.Builder
	for _, video := range item.videos {
		fmt.Fprintf(&fingerprint, "%s:%d;", video.ID, video.Size)
	}
	key := fingerprint.String()
	r.service.mu.Lock()
	defer r.service.mu.Unlock()
	previous, known := r.service.sizes[item.entry.ID]
	r.service.sizes[item.entry.ID] = key
	return known && previous == key
}

func (r *run) item(ctx context.Context, rule Rule, entry pan.File) error {
	if r.summary != nil {
		r.summary.entries++
	}
	if strings.HasPrefix(entry.Name, "_") {
		r.count(func(s *summary) { s.skipped++ })
		return nil // reserved for helper folders such as a failed directory inside the inbox
	}
	item, err := r.collect(ctx, entry)
	if err != nil {
		return err
	}
	if len(item.videos) == 0 {
		r.count(func(s *summary) { s.noVideo++ })
		return nil
	}
	if !r.stable(item) {
		r.count(func(s *summary) { s.waiting++ })
		return nil
	}
	r.count(func(s *summary) { s.handled++ })
	plan, failure := r.plan(ctx, item)
	if failure != "" {
		return r.fail(ctx, rule, item, plan.code, failure)
	}
	if rule.DryRun {
		r.service.mu.Lock()
		reported := r.service.failed[entry.ID] == "dry_run"
		r.service.failed[entry.ID] = "dry_run"
		r.service.mu.Unlock()
		if !reported {
			r.service.record(ctx, Entry{Source: entry.Name, Code: plan.code, Target: plan.describe(), Status: "dry_run"})
		}
		return nil
	}
	codeID, err := r.execute(ctx, rule, item, plan)
	if err == nil {
		err = r.service.scan(ctx, r.files.Source(), codeID, plan.code)
	}
	if err != nil {
		return r.fail(ctx, rule, item, plan.code, err.Error())
	}
	r.service.record(ctx, Entry{Source: entry.Name, Code: plan.code, Target: plan.describe(), Status: "done"})
	return nil
}

func (r *run) count(update func(*summary)) {
	if r.summary != nil {
		update(r.summary)
	}
}

type move struct {
	file pan.File
	name string
}

type plan struct {
	code     string
	actorDir string
	moves    []move
}

func (p plan) describe() string {
	names := make([]string, len(p.moves))
	for i, m := range p.moves {
		names[i] = m.name
	}
	return p.actorDir + "/" + SafeName(p.code) + "/ " + strings.Join(names, ", ")
}

// plan identifies the release and names its files. A non-empty failure says
// why the release cannot be organized.
func (r *run) plan(ctx context.Context, item release) (plan, string) {
	var p plan
	var codes []string
	for _, video := range item.videos {
		if code, ok := codeid.Parse(video.Name); ok {
			codes = append(codes, code)
		}
	}
	code, other := releaseCode(codes)
	if other != "" {
		return p, fmt.Sprintf("文件夹里有多部影片（%s、%s）", code, other)
	}
	p.code = code
	if p.code == "" {
		code, ok := codeid.Parse(item.entry.Name)
		if !ok {
			return p, "无法识别番号"
		}
		p.code, _ = releaseCode([]string{code})
	}
	p.code = codeid.Normalize(p.code)
	metadata, err := r.service.metadata.Resolve(ctx, domain.MovieRef{Code: p.code})
	if err != nil {
		return p, "刮削失败：" + err.Error()
	}
	var actors []Actor
	aliases := actorname.Current()
	for _, actor := range metadata.Detail.Actors {
		if actor.Gender == "male" {
			continue
		}
		known := Actor{Name: actor.Name}
		if actor.NameZHT != "" && actor.NameZHT != actor.Name {
			known.Aliases = []string{actor.NameZHT}
		}
		// A merged actor keeps the folder chosen for the merge.
		if kept := aliases.Canonical(actor.Name); kept != actor.Name {
			known = Actor{Name: kept, Aliases: append([]string{actor.Name}, known.Aliases...)}
		} else if actor.NameZHT != "" {
			if kept := aliases.Canonical(actor.NameZHT); kept != actor.NameZHT {
				known = Actor{Name: kept, Aliases: []string{actor.Name, actor.NameZHT}}
			}
		}
		actors = append(actors, known)
	}
	if !r.listed {
		if r.actorDirs, err = r.files.Entries(ctx, r.files.Source().Directory.ID); err != nil {
			return p, "读取整理后目录失败：" + err.Error()
		}
		r.listed = true
	}
	var existing []string
	for _, dir := range r.actorDirs {
		if dir.IsDirectory {
			existing = append(existing, dir.Name)
		}
	}
	p.actorDir = ResolveActorDirectory(actors, r.cfg.MaxActors, existing)

	videos := slices.Clone(item.videos)
	slices.SortFunc(videos, func(a, b pan.File) int { return strings.Compare(a.Name, b.Name) })
	folder := ParseMarks(item.entry.Name, p.code)
	for i, video := range videos {
		marks := ParseMarks(video.Name, p.code)
		part := i + 1
		if marks.Part > 0 {
			part = marks.Part
		}
		name := VideoName(p.code, marks.Chinese || folder.Chinese, part, len(videos), path.Ext(video.Name))
		p.moves = append(p.moves, move{file: video, name: name})
	}
	stem := strings.TrimSuffix(p.moves[0].name, path.Ext(p.moves[0].name))
	for i, subtitle := range item.subtitles {
		suffix := path.Ext(subtitle.Name)
		if lang := path.Ext(strings.TrimSuffix(subtitle.Name, suffix)); len(lang) > 1 && len(lang) <= 7 {
			suffix = lang + suffix
		} else if i > 0 {
			suffix = fmt.Sprintf(".%d%s", i+1, suffix)
		}
		p.moves = append(p.moves, move{file: subtitle, name: stem + strings.ToLower(suffix)})
	}
	return p, ""
}

var (
	// glued subtitle markers such as PRED-709CH, which codeid keeps in the code
	gluedMarker   = regexp.MustCompile(`^(.*-[0-9]+)(?:CH|UC)$`)
	letterVariant = regexp.MustCompile(`^(.*-[0-9]+)-[A-Z]$`)
)

// releaseCode picks the code of a release from its videos' codes. Glued
// subtitle markers are dropped, and ABP-123-A/ABP-123-B count as parts of
// ABP-123. A second, unrelated code is returned as other.
func releaseCode(codes []string) (code, other string) {
	stripped := make([]string, len(codes))
	for i, c := range codes {
		stripped[i] = gluedMarker.ReplaceAllString(c, "$1")
	}
	if len(stripped) > 1 {
		bases := make(map[string]bool)
		for _, c := range stripped {
			bases[letterVariant.ReplaceAllString(c, "$1")] = true
		}
		if len(bases) == 1 {
			for base := range bases {
				return base, ""
			}
		}
	}
	for _, c := range stripped {
		if code == "" {
			code = c
		} else if !codeid.IsEquivalent(code, c) {
			return code, c
		}
	}
	return codeid.Normalize(code), ""
}

// execute creates {actor}/{code} in the library, renames and moves the files
// there and recycles what is left of the release. It returns the code folder.
func (r *run) execute(ctx context.Context, rule Rule, item release, p plan) (string, error) {
	root := r.files.Source().Directory.ID
	actorID, err := r.ensureActorDir(ctx, root, p.actorDir)
	if err != nil {
		return "", fmt.Errorf("创建演员目录失败：%w", err)
	}
	codeName := SafeName(p.code)
	children, err := r.files.Entries(ctx, actorID)
	if err != nil {
		return "", err
	}
	codeID := ""
	for _, child := range children {
		if child.IsDirectory && strings.EqualFold(child.Name, codeName) {
			codeID = child.ID
		}
	}
	if codeID != "" {
		existing, err := r.files.Entries(ctx, codeID)
		if err != nil {
			return "", err
		}
		if slices.ContainsFunc(existing, func(file pan.File) bool { return domain.IsVideo(file.Name) && file.Size >= domain.MinVideoSize }) {
			return "", fmt.Errorf("整理后目录已有 %s/%s 的视频", p.actorDir, codeName)
		}
	} else if codeID, err = r.files.Mkdir(ctx, actorID, codeName); err != nil {
		return "", fmt.Errorf("创建番号目录失败：%w", err)
	}
	ids := make([]string, 0, len(p.moves))
	for _, m := range p.moves {
		if m.file.Name != m.name {
			if err := r.files.Rename(ctx, m.file.ID, m.name); err != nil {
				return "", fmt.Errorf("重命名 %s 失败：%w", m.file.Name, err)
			}
		}
		ids = append(ids, m.file.ID)
	}
	if err := r.files.Move(ctx, ids, codeID); err != nil {
		return "", fmt.Errorf("移动失败：%w", err)
	}
	if item.entry.IsDirectory && r.cfg.CleanJunk {
		if err := r.files.Delete(ctx, []string{item.entry.ID}, rule.Source.ID); err != nil {
			slog.WarnContext(ctx, "failed to recycle organized release folder", "name", item.entry.Name, "error", err)
		}
	}
	return codeID, nil
}

// scan queues a targeted scan of an organized code folder.
func (s *Service) scan(ctx context.Context, source domain.LibrarySource, codeID, code string) error {
	return ent.WithTx(ctx, s.db, func(tx *ent.Tx) error {
		_, err := s.scanner.EnqueueTargetedScan(ctx, tx, source, codeID, 0, code, "")
		if err == nil && s.wake != nil {
			tx.OnCommit(func(next ent.Committer) ent.Committer {
				return ent.CommitFunc(func(ctx context.Context, tx *ent.Tx) error {
					err := next.Commit(ctx, tx)
					if err == nil {
						s.wake()
					}
					return err
				})
			})
		}
		return err
	})
}

func (r *run) ensureActorDir(ctx context.Context, root, name string) (string, error) {
	for _, dir := range r.actorDirs {
		if dir.IsDirectory && dir.Name == name {
			return dir.ID, nil
		}
	}
	id, err := r.files.Mkdir(ctx, root, name)
	if err != nil {
		return "", err
	}
	r.actorDirs = append(r.actorDirs, pan.File{ID: id, Name: name, IsDirectory: true})
	return id, nil
}

// fail logs the release once and moves it to the rule's failed folder.
func (r *run) fail(ctx context.Context, rule Rule, item release, code, reason string) error {
	r.service.mu.Lock()
	reported := r.service.failed[item.entry.ID] == reason
	r.service.failed[item.entry.ID] = reason
	r.service.mu.Unlock()
	if reported {
		return nil
	}
	detail := reason
	if rule.Failed.ID != "" && !rule.DryRun {
		if err := r.files.Move(ctx, []string{item.entry.ID}, rule.Failed.ID); err != nil {
			detail += "；移到失败目录也失败：" + err.Error()
		} else {
			detail += "；已移到 " + rule.Failed.Path
		}
	}
	r.service.record(ctx, Entry{Source: item.entry.Name, Code: code, Status: "failed", Detail: detail})
	return nil
}

// ErrNotPlaced means a finished download was left where 115 put it, because
// no rule is enabled or the download could not be organized.
var ErrNotPlaced = errors.New("download not organized")

// Place organizes a finished offline download, which 115 saves in the
// library root, and returns its code folder. The caller queues the scan.
func (s *Service) Place(ctx context.Context, fileID, code string) (string, error) {
	cfg, err := s.Config(ctx)
	if err != nil {
		return "", err
	}
	if !slices.ContainsFunc(cfg.Rules, func(rule Rule) bool { return rule.Enabled && !rule.DryRun }) {
		return "", ErrNotPlaced
	}
	s.running.Lock()
	defer s.running.Unlock()
	files, err := s.open(ctx)
	if err != nil {
		return "", err
	}
	root := files.Source().Directory.ID
	entries, err := files.Entries(ctx, root)
	if err != nil {
		return "", err
	}
	index := slices.IndexFunc(entries, func(entry pan.File) bool { return entry.ID == fileID })
	if index < 0 {
		return "", ErrNotPlaced // already moved, or saved below the root
	}
	r := &run{service: s, files: files, cfg: cfg, actorDirs: entries, listed: true}
	item, err := r.collect(ctx, entries[index])
	if err != nil {
		return "", err
	}
	// The release folder must be a direct child of the root to be recycled.
	rule := Rule{Source: Folder{ID: root}}
	if len(item.videos) == 0 {
		return "", fmt.Errorf("%w: no video", ErrNotPlaced)
	}
	p, failure := r.plan(ctx, item)
	if failure == "" && code != "" && !codeid.IsEquivalent(p.code, codeid.Normalize(code)) {
		failure = fmt.Sprintf("下载的番号 %s 与影片 %s 不一致", p.code, code)
	}
	var codeID string
	if failure == "" {
		if codeID, err = r.execute(ctx, rule, item, p); err != nil {
			failure = err.Error()
		}
	}
	if failure != "" {
		s.record(ctx, Entry{Source: item.entry.Name, Code: p.code, Status: "failed", Detail: "离线下载：" + failure})
		return "", fmt.Errorf("%w: %s", ErrNotPlaced, failure)
	}
	s.record(ctx, Entry{Source: item.entry.Name, Code: p.code, Target: p.describe(), Status: "done", Detail: "离线下载"})
	return codeID, nil
}

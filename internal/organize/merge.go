package organize

import (
	"context"
	"fmt"
	"log/slog"
	"path"
	"slices"
	"strings"

	"github.com/ppxb/miyabi/internal/actorname"
	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/ent/file"
	"github.com/ppxb/miyabi/internal/ent/movie"
	"github.com/ppxb/miyabi/internal/pan"
)

const aliasSetting = "organize.actor_aliases"

// ActorFolder is one actor folder below the media directory.
type ActorFolder struct {
	Name   string `json:"name"`
	Movies int    `json:"movies"`
}

// ActorGroup is a set of folders that look like one actor (or one cast).
type ActorGroup struct {
	Folders   []ActorFolder `json:"folders"`
	Suggested string        `json:"suggested"`
}

// ActorFolders lists the media directory's actor folders and the groups that
// seem to hold the same actor under different spellings.
type ActorFolders struct {
	Groups  []ActorGroup  `json:"groups"`
	Folders []ActorFolder `json:"folders"`
}

// ActorMerge moves the movie folders of Sources into Target.
type ActorMerge struct {
	Target  string   `json:"target"`
	Sources []string `json:"sources"`
}

// LoadAliases applies the saved merges to exports; call it once at startup.
func (s *Service) LoadAliases(ctx context.Context) error {
	aliases, _, err := database.LoadSetting[actorname.Aliases](ctx, s.db, aliasSetting)
	if err != nil {
		return err
	}
	actorname.Set(aliases)
	return nil
}

// SetSync registers the library sync that runs after a merge, so the local
// export and Emby follow the new folders.
func (s *Service) SetSync(sync func(context.Context) error) { s.sync = sync }

// actorLinks joins actor names that belong to one person: kanji forms of a
// name, a source's Japanese and Chinese names, a folder and the actor its
// movies credit, and merges done earlier.
type actorLinks struct {
	parent map[string]string
	names  map[string][]string // root key -> every spelling seen
}

func (l *actorLinks) find(key string) string {
	for {
		parent, ok := l.parent[key]
		if !ok || parent == key {
			return key
		}
		if grand := l.parent[parent]; grand != "" {
			l.parent[key] = grand
		}
		key = parent
	}
}

func (l *actorLinks) union(a, b string) {
	if a == "" || b == "" {
		return
	}
	ra, rb := l.find(a), l.find(b)
	if ra != rb {
		l.parent[ra] = rb
	}
}

func (l *actorLinks) root(name string) string { return l.find(actorname.Key(SafeName(name))) }

// spellings returns every name joined with name, including name itself.
func (l *actorLinks) spellings(name string) []string {
	root := l.root(name)
	var out []string
	for key, names := range l.names {
		if l.find(key) == root {
			out = append(out, names...)
		}
	}
	return append(out, name)
}

type folderInfo struct {
	dir    pan.File
	movies map[int]bool
}

// minCredit is the share of a folder's movies that must credit one actor
// before the folder is taken to be that actor.
const minCredit = 0.8

func (s *Service) linkActors(ctx context.Context, files Files) (*actorLinks, []*folderInfo, error) {
	source := files.Source()
	entries, err := files.Entries(ctx, source.Directory.ID)
	if err != nil {
		return nil, nil, err
	}
	byName := make(map[string]*folderInfo)
	var folders []*folderInfo
	for _, entry := range entries {
		if !entry.IsDirectory || entry.Name == UnknownActor || entry.Name == ManyActors {
			continue
		}
		info := &folderInfo{dir: entry, movies: make(map[int]bool)}
		byName[entry.Name] = info
		folders = append(folders, info)
	}

	indexed, err := s.db.File.Query().Where(database.LibraryFiles(source), file.MovieIDNotNil()).
		Select(file.FieldPath, file.FieldMovieID).All(ctx)
	if err != nil {
		return nil, nil, err
	}
	root := strings.TrimSuffix(source.Directory.Path, "/") + "/"
	var movieIDs []int
	for _, entry := range indexed {
		rel, ok := strings.CutPrefix(entry.Path, root)
		if !ok {
			continue
		}
		name, _, _ := strings.Cut(rel, "/")
		if info := byName[name]; info != nil && !info.movies[*entry.MovieID] {
			info.movies[*entry.MovieID] = true
			movieIDs = append(movieIDs, *entry.MovieID)
		}
	}
	movies, err := s.db.Movie.Query().Where(movie.IDIn(movieIDs...)).Select(movie.FieldID).WithActors().All(ctx)
	if err != nil {
		return nil, nil, err
	}
	credits := make(map[int][]string, len(movies))
	links := &actorLinks{parent: make(map[string]string), names: make(map[string][]string)}
	note := func(name string) string {
		key := actorname.Key(SafeName(name))
		if key != "" && !slices.Contains(links.names[key], name) {
			links.names[key] = append(links.names[key], name)
		}
		return key
	}
	for _, record := range movies {
		for _, person := range record.Edges.Actors {
			if person.Gender == "male" {
				continue
			}
			key := note(person.Name)
			if person.NameZht != nil && *person.NameZht != "" {
				links.union(key, note(*person.NameZht))
			}
			credits[record.ID] = append(credits[record.ID], key)
		}
	}
	for _, info := range folders {
		key := note(info.dir.Name)
		if strings.Contains(info.dir.Name, ",") || len(info.movies) == 0 {
			continue
		}
		counts := make(map[string]int)
		for id := range info.movies {
			for _, credited := range slices.Compact(slices.Sorted(slices.Values(credits[id]))) {
				counts[credited]++
			}
		}
		var credited []string
		for name, count := range counts {
			if float64(count) >= minCredit*float64(len(info.movies)) {
				credited = append(credited, name)
			}
		}
		if len(credited) == 1 {
			links.union(key, credited[0])
		}
	}
	// Translated names in imported NFOs pair with the catalogue's spelling.
	for name, alias := range s.aliases.Aliases(ctx) {
		if _, seen := links.names[actorname.Key(SafeName(name))]; seen {
			links.union(note(name), note(alias.Name))
		}
	}
	aliases, _, err := database.LoadSetting[actorname.Aliases](ctx, s.db, aliasSetting)
	if err != nil {
		return nil, nil, err
	}
	for key, kept := range aliases {
		links.union(key, note(kept))
	}
	return links, folders, nil
}

// castKey identifies a folder's cast regardless of spelling and order.
func castKey(links *actorLinks, name string) string {
	parts := strings.Split(name, ",")
	keys := make([]string, 0, len(parts))
	for _, part := range parts {
		if key := links.root(part); key != "" {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	return strings.Join(keys, ",")
}

// FindActorFolders lists actor folders and groups the likely duplicates.
func (s *Service) FindActorFolders(ctx context.Context) (ActorFolders, error) {
	files, err := s.open(ctx)
	if err != nil {
		return ActorFolders{}, err
	}
	links, folders, err := s.linkActors(ctx, files)
	if err != nil {
		return ActorFolders{}, err
	}
	result := ActorFolders{Groups: []ActorGroup{}, Folders: make([]ActorFolder, 0, len(folders))}
	byCast := make(map[string][]ActorFolder)
	var casts []string
	for _, info := range folders {
		folder := ActorFolder{Name: info.dir.Name, Movies: len(info.movies)}
		result.Folders = append(result.Folders, folder)
		key := castKey(links, info.dir.Name)
		if _, seen := byCast[key]; !seen {
			casts = append(casts, key)
		}
		byCast[key] = append(byCast[key], folder)
	}
	slices.SortFunc(result.Folders, func(a, b ActorFolder) int { return strings.Compare(a.Name, b.Name) })
	for _, key := range casts {
		group := byCast[key]
		if len(group) < 2 {
			continue
		}
		slices.SortFunc(group, func(a, b ActorFolder) int {
			if a.Movies != b.Movies {
				return b.Movies - a.Movies
			}
			return strings.Compare(a.Name, b.Name)
		})
		result.Groups = append(result.Groups, ActorGroup{Folders: group, Suggested: group[0].Name})
	}
	slices.SortFunc(result.Groups, func(a, b ActorGroup) int { return strings.Compare(a.Suggested, b.Suggested) })
	return result, nil
}

// MergeActors checks the request and merges in the background, writing the
// outcome to the organizing log.
func (s *Service) MergeActors(ctx context.Context, merges []ActorMerge) error {
	if len(merges) == 0 {
		return domain.E(domain.KindInvalid, "请选择要合并的演员目录", nil)
	}
	for i, merge := range merges {
		merge.Target = SafeName(merge.Target)
		if merge.Target == "" || merge.Target == UnknownActor || merge.Target == ManyActors {
			return domain.E(domain.KindInvalid, "请选择合并后的演员目录名", nil)
		}
		merge.Sources = slices.DeleteFunc(slices.Clone(merge.Sources), func(name string) bool { return name == merge.Target })
		if len(merge.Sources) == 0 {
			return domain.E(domain.KindInvalid, fmt.Sprintf("「%s」没有要合并进来的目录", merge.Target), nil)
		}
		merges[i] = merge
	}
	ctx = context.WithoutCancel(ctx)
	go func() {
		s.running.Lock()
		err := s.mergeActors(ctx, merges)
		s.running.Unlock()
		if err != nil {
			slog.WarnContext(ctx, "merge actor folders failed", "error", err)
			s.record(ctx, Entry{Status: "failed", Detail: "合并演员目录失败：" + err.Error()})
		}
	}()
	return nil
}

// moveBatch bounds one 115 move request.
const moveBatch = 100

func (s *Service) mergeActors(ctx context.Context, merges []ActorMerge) error {
	files, err := s.open(ctx)
	if err != nil {
		return err
	}
	links, folders, err := s.linkActors(ctx, files)
	if err != nil {
		return err
	}
	source := files.Source()
	root := strings.TrimSuffix(source.Directory.Path, "/")
	byName := make(map[string]pan.File, len(folders))
	for _, info := range folders {
		byName[info.dir.Name] = info.dir
	}
	aliases, _, err := database.LoadSetting[actorname.Aliases](ctx, s.db, aliasSetting)
	if err != nil {
		return err
	}
	if aliases == nil {
		aliases = make(actorname.Aliases)
	}

	type rename struct{ from, to string }
	var renames []rename
	var targets []string
	moved, kept := 0, 0
	for _, merge := range merges {
		target, ok := byName[merge.Target]
		if !ok {
			id, err := files.Mkdir(ctx, source.Directory.ID, merge.Target)
			if err != nil {
				return fmt.Errorf("创建「%s」: %w", merge.Target, err)
			}
			target = pan.File{ID: id, Name: merge.Target, IsDirectory: true}
			byName[merge.Target] = target
		}
		children, err := files.Entries(ctx, target.ID)
		if err != nil {
			return err
		}
		taken := make(map[string]bool, len(children))
		for _, child := range children {
			taken[child.Name] = true
		}
		targets = append(targets, merge.Target)
		for _, name := range merge.Sources {
			dir, ok := byName[name]
			if !ok {
				s.record(ctx, Entry{Source: name, Target: merge.Target, Status: "failed", Detail: "演员目录已不存在"})
				continue
			}
			children, err := files.Entries(ctx, dir.ID)
			if err != nil {
				return err
			}
			var ids, conflicts []string
			for _, child := range children {
				if taken[child.Name] {
					conflicts = append(conflicts, child.Name)
					continue
				}
				taken[child.Name] = true
				ids = append(ids, child.ID)
				renames = append(renames, rename{
					from: root + "/" + name + "/" + child.Name,
					to:   root + "/" + merge.Target + "/" + child.Name,
				})
			}
			for start := 0; start < len(ids); start += moveBatch {
				if err := files.Move(ctx, ids[start:min(start+moveBatch, len(ids))], target.ID); err != nil {
					return fmt.Errorf("移动「%s」: %w", name, err)
				}
			}
			moved += len(ids)
			entry := Entry{Source: name, Target: merge.Target, Status: "done", Detail: fmt.Sprintf("移入 %d 项", len(ids))}
			if len(conflicts) > 0 {
				kept += len(conflicts)
				entry.Detail += fmt.Sprintf("；目标已有同名的 %s，原目录保留", strings.Join(conflicts, "、"))
			} else if err := files.Delete(ctx, []string{dir.ID}, source.Directory.ID); err != nil {
				entry.Detail += "；删除空目录失败：" + err.Error()
			}
			s.record(ctx, entry)
		}
		// Every spelling of each cast member now names the target's member.
		parts := strings.Split(merge.Target, ",")
		for _, name := range append(slices.Clone(merge.Sources), merge.Target) {
			for _, part := range strings.Split(name, ",") {
				canonical := part
				for _, candidate := range parts {
					if links.root(candidate) == links.root(part) {
						canonical = candidate
						break
					}
				}
				if len(parts) == 1 {
					canonical = merge.Target
				}
				for _, spelling := range links.spellings(part) {
					if key := actorname.Key(SafeName(spelling)); key != "" {
						aliases[key] = canonical
					}
				}
			}
		}
	}
	if err := database.SaveSetting(ctx, s.db, aliasSetting, aliases); err != nil {
		return err
	}
	actorname.Set(aliases)

	for _, change := range renames {
		indexed, err := s.db.File.Query().Where(database.LibraryFiles(source), file.PathHasPrefix(change.from+"/")).
			Select(file.FieldID, file.FieldPath).All(ctx)
		if err != nil {
			return err
		}
		for _, entry := range indexed {
			if err := s.db.File.UpdateOneID(entry.ID).SetPath(change.to + strings.TrimPrefix(entry.Path, change.from)).Exec(ctx); err != nil {
				return err
			}
		}
	}

	rewritten, err := s.rewriteNFOs(ctx, files, root, targets, aliases)
	if err != nil {
		return err
	}
	s.record(ctx, Entry{Status: "info", Detail: fmt.Sprintf(
		"演员目录合并完成：移动 %d 个番号文件夹，%d 个因重名保留在原处，改写 115 上 %d 个 NFO 的演员名；接下来同步媒体库",
		moved, kept, rewritten)})
	if s.sync != nil {
		return s.sync(ctx)
	}
	return nil
}

// rewriteNFOs replaces the 115 NFOs of movies in the merged folders whose
// actors now go by another name.
func (s *Service) rewriteNFOs(ctx context.Context, files Files, root string, targets []string, aliases actorname.Aliases) (int, error) {
	source := files.Source()
	type location struct {
		dirID  string
		names  []string
		videos map[string]bool
	}
	places := make(map[int]map[string]*location)
	for _, target := range targets {
		indexed, err := s.db.File.Query().Where(database.LibraryFiles(source), file.MovieIDNotNil(),
			file.PathHasPrefix(root+"/"+target+"/")).Select(file.FieldFileID, file.FieldParentID, file.FieldName, file.FieldMovieID).All(ctx)
		if err != nil {
			return 0, err
		}
		for _, entry := range indexed {
			dirs := places[*entry.MovieID]
			if dirs == nil {
				dirs = make(map[string]*location)
				places[*entry.MovieID] = dirs
			}
			if dirs[entry.ParentID] == nil {
				dirs[entry.ParentID] = &location{dirID: entry.ParentID, videos: make(map[string]bool)}
			}
			dirs[entry.ParentID].names = append(dirs[entry.ParentID].names, entry.Name)
			dirs[entry.ParentID].videos[entry.FileID] = true
		}
	}
	ids := make([]int, 0, len(places))
	for id := range places {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	rewritten := 0
	for _, id := range ids {
		record, err := s.db.Movie.Query().Where(movie.IDEQ(id)).Select(movie.FieldID, movie.FieldMetadata).Only(ctx)
		if err != nil {
			return rewritten, err
		}
		if record.Metadata == nil {
			continue
		}
		renamed := aliases.Rename(record.Metadata.Actors)
		if slices.Equal(renamed, record.Metadata.Actors) {
			continue
		}
		for _, place := range places[id] {
			entries, err := files.Entries(ctx, place.dirID)
			if err != nil {
				return rewritten, err
			}
			slices.Sort(place.names)
			body, err := sidecarNFO(*record.Metadata, place.names)
			if err != nil {
				return rewritten, err
			}
			name := partStem.ReplaceAllString(strings.TrimSuffix(place.names[0], path.Ext(place.names[0])), "") + ".nfo"
			var old []string
			shared := false
			for _, entry := range entries {
				if entry.IsDirectory {
					continue
				}
				if strings.EqualFold(path.Ext(entry.Name), ".nfo") {
					old = append(old, entry.ID)
					name = entry.Name
				}
				// An NFO in a folder shared with another movie is not this movie's.
				if domain.IsVideo(entry.Name) && entry.Size >= domain.MinVideoSize && !place.videos[entry.ID] {
					shared = true
				}
			}
			if len(old) == 0 || shared {
				continue
			}
			if err := files.Delete(ctx, old, place.dirID); err != nil {
				return rewritten, err
			}
			if _, err := files.Upload(ctx, place.dirID, name, body); err != nil {
				return rewritten, fmt.Errorf("上传 %s: %w", name, err)
			}
			rewritten++
		}
	}
	return rewritten, nil
}

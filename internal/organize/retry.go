package organize

import (
	"context"
	"slices"
	"strings"

	"github.com/ppxb/miyabi/internal/codeid"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/pan"
)

// FailedItem is a release waiting in a rule's failed folder.
type FailedItem struct {
	Name   string `json:"name"`
	Folder string `json:"folder"`
	// Code is the code found in the name, as a starting point for the user.
	Code string `json:"code,omitempty"`
	// Reason is the latest logged failure for the release.
	Reason string `json:"reason,omitempty"`
}

// Failed lists what the failed folders of the enabled rules hold.
func (s *Service) Failed(ctx context.Context) ([]FailedItem, error) {
	cfg, err := s.Config(ctx)
	if err != nil {
		return nil, err
	}
	files, err := s.open(ctx)
	if err != nil {
		return nil, err
	}
	entries, err := s.Log(ctx)
	if err != nil {
		return nil, err
	}
	reasons := make(map[string]string)
	for _, entry := range entries { // newest first
		if entry.Status == "failed" && entry.Source != "" && reasons[entry.Source] == "" {
			reasons[entry.Source] = entry.Detail
		}
	}
	items := []FailedItem{}
	seen := make(map[string]bool)
	for _, rule := range cfg.Rules {
		if rule.Failed.ID == "" || seen[rule.Failed.ID] {
			continue
		}
		seen[rule.Failed.ID] = true
		children, err := files.Entries(ctx, rule.Failed.ID)
		if err != nil {
			return nil, err
		}
		for _, child := range children {
			item := FailedItem{Name: child.Name, Folder: rule.Failed.Path, Reason: reasons[child.Name]}
			if code, ok := codeid.Parse(child.Name); ok {
				item.Code = codeid.Normalize(code)
			}
			items = append(items, item)
		}
	}
	slices.SortFunc(items, func(a, b FailedItem) int { return strings.Compare(a.Name, b.Name) })
	return items, nil
}

// Retry organizes a release from a failed folder under the code the user
// gives. A release that fails again stays where it is.
func (s *Service) Retry(ctx context.Context, name, code string) (Entry, error) {
	code = codeid.Normalize(strings.TrimSpace(code))
	if parsed, ok := codeid.Parse(code); ok {
		code = codeid.Normalize(parsed)
	}
	if code == "" {
		return Entry{}, domain.E(domain.KindInvalid, "请填写番号", nil)
	}
	cfg, err := s.Config(ctx)
	if err != nil {
		return Entry{}, err
	}
	s.running.Lock()
	defer s.running.Unlock()
	files, err := s.open(ctx)
	if err != nil {
		return Entry{}, err
	}
	for _, rule := range cfg.Rules {
		if rule.Failed.ID == "" {
			continue
		}
		children, err := files.Entries(ctx, rule.Failed.ID)
		if err != nil {
			return Entry{}, err
		}
		index := slices.IndexFunc(children, func(entry pan.File) bool { return entry.Name == name })
		if index < 0 {
			continue
		}
		// The release is organized out of the failed folder and, failing
		// again, left in it.
		retry := Rule{Enabled: true, DryRun: rule.DryRun, Source: rule.Failed}
		r := &run{service: s, files: files, cfg: cfg}
		item, err := r.collect(ctx, children[index])
		if err != nil {
			return Entry{}, err
		}
		if len(item.videos) == 0 {
			return Entry{}, domain.E(domain.KindInvalid, "没有达到大小的视频", nil)
		}
		item.code = code
		s.mu.Lock()
		delete(s.failed, item.entry.ID)
		s.mu.Unlock()
		p, failure := r.plan(ctx, item)
		if failure == "" && retry.DryRun {
			entry := Entry{Source: name, Code: p.code, Target: p.describe(), Status: "dry_run"}
			s.record(ctx, entry)
			return entry, nil
		}
		if failure == "" {
			var codeID string
			if codeID, err = r.execute(ctx, retry, item, p); err == nil {
				err = s.scan(ctx, files.Source(), codeID, p.code)
			}
			if err != nil {
				failure = err.Error()
			}
		}
		if failure != "" {
			entry := Entry{Source: name, Code: code, Status: "failed", Detail: failure}
			s.record(ctx, entry)
			return entry, nil
		}
		entry := Entry{Source: name, Code: p.code, Target: p.describe(), Status: "done"}
		s.record(ctx, entry)
		return entry, nil
	}
	return Entry{}, domain.E(domain.KindNotFound, "失败目录里已经没有「"+name+"」", nil)
}

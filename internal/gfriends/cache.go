package gfriends

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Portraits fetched for the web pages are kept on disk; a missing one is
// remembered for a day so a page full of unknown names stays cheap.
const missingTTL = 24 * time.Hour

// Downloads run a few at a time so a page of portraits does not flood the mirrors.
var downloads = make(chan struct{}, 4)

type avatarCache struct {
	mu      sync.Mutex
	missing map[string]time.Time
}

// CachedAvatar returns the actor's portrait, downloading it once into the
// data directory. It returns os.ErrNotExist when GFriends has none.
func (c *Client) CachedAvatar(ctx context.Context, name string) ([]byte, error) {
	if c.dataDir == "" {
		return c.FetchAvatar(ctx, name)
	}
	key := normalizeName(name)
	if key == "" {
		return nil, os.ErrNotExist
	}
	if c.cache.isMissing(key) {
		return nil, os.ErrNotExist
	}
	sum := sha1.Sum([]byte(key))
	file := filepath.Join(c.dataDir, "gfriends_avatars", hex.EncodeToString(sum[:]))
	if data, err := os.ReadFile(file); err == nil {
		return data, nil
	}
	select {
	case downloads <- struct{}{}:
		defer func() { <-downloads }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	// Another request may have fetched it while this one waited.
	if data, err := os.ReadFile(file); err == nil {
		return data, nil
	}
	data, err := c.FetchAvatar(ctx, name)
	if errors.Is(err, os.ErrNotExist) {
		c.cache.markMissing(key)
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return data, nil
	}
	if err := os.WriteFile(file, data, 0o644); err != nil {
		return data, fmt.Errorf("save avatar: %w", err)
	}
	return data, nil
}

func (a *avatarCache) isMissing(key string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	until, ok := a.missing[key]
	if ok && time.Now().After(until) {
		delete(a.missing, key)
		return false
	}
	return ok
}

func (a *avatarCache) markMissing(key string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.missing == nil {
		a.missing = make(map[string]time.Time)
	}
	a.missing[key] = time.Now().Add(missingTTL)
}

package gfriends

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/disintegration/imaging"
)

// Portraits fetched for the web pages are kept on disk; a missing one is
// remembered for a day so a page full of unknown names stays cheap.
const missingTTL = 24 * time.Hour

// GFriends serves originals of a megabyte or more; pages show small circles,
// so the cached copy is scaled down to this width.
const portraitWidth = 320

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
	file := filepath.Join(c.dataDir, "actor_portraits", hex.EncodeToString(sum[:]))
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
	data = shrink(data)
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

// shrink keeps the original when it is already small or cannot be decoded.
func shrink(data []byte) []byte {
	source, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
	if err != nil || source.Bounds().Dx() <= portraitWidth {
		return data
	}
	var out bytes.Buffer
	small := imaging.Resize(source, portraitWidth, 0, imaging.Lanczos)
	if err := imaging.Encode(&out, small, imaging.JPEG, imaging.JPEGQuality(85)); err != nil {
		return data
	}
	return out.Bytes()
}

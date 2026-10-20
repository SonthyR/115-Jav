package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"fmt"
	"time"

	"github.com/ppxb/miyabi/internal/config"
	"github.com/ppxb/miyabi/internal/database"
	"github.com/ppxb/miyabi/internal/drive"
	"github.com/ppxb/miyabi/internal/pan"
)

// selfTest115 exercises every 115 write operation inside a throwaway folder in
// the media directory, then moves that folder to the recycle bin.
func selfTest115(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	store, err := database.Open(ctx, cfg.DataDir)
	if err != nil {
		return err
	}
	defer store.Close()
	d, err := drive.New(ctx, store.Client)
	if err != nil {
		return err
	}
	defer d.Close()
	files, err := d.OpenFiles(ctx)
	if err != nil {
		return fmt.Errorf("open 115 (log in and mount a media directory first): %w", err)
	}
	media := files.MediaDirectory()
	fmt.Printf("媒体目录：%s\n", media.Path)

	step := func(name string, run func() error) error {
		if err := run(); err != nil {
			fmt.Printf("✗ %s：%v\n", name, err)
			return err
		}
		fmt.Printf("✓ %s\n", name)
		return nil
	}
	find := func(dirID, name string) (pan.File, error) {
		page, err := files.List(ctx, dirID, 0)
		if err != nil {
			return pan.File{}, err
		}
		for _, entry := range page.Files {
			if entry.Name == name {
				return entry, nil
			}
		}
		return pan.File{}, fmt.Errorf("%s 不在目录中", name)
	}

	var root, sub string
	var uploaded pan.File
	// Random content cannot be completed by hash, so the OSS path is exercised.
	payload := make([]byte, 200<<10)
	_, _ = rand.Read(payload)
	name := "_115jav_selftest_" + time.Now().Format("20060102150405")
	steps := []struct {
		name string
		run  func() error
	}{
		{"建目录 " + name, func() (err error) { root, err = files.Mkdir(ctx, media.ID, name); return }},
		{"上传 200KB 测试文件", func() error {
			if _, err := files.Upload(ctx, root, "upload.bin", payload); err != nil {
				return err
			}
			var err error
			uploaded, err = find(root, "upload.bin")
			return err
		}},
		{"读回并核对内容", func() error {
			body, err := files.Read(ctx, uploaded.PickCode, int64(len(payload)))
			if err == nil && !bytes.Equal(body, payload) {
				err = fmt.Errorf("内容不一致")
			}
			return err
		}},
		{"重命名为 renamed.bin", func() error { return files.Rename(ctx, uploaded.ID, "renamed.bin") }},
		{"建子目录 sub", func() (err error) { sub, err = files.Mkdir(ctx, root, "sub"); return }},
		{"移动到 sub", func() error {
			if err := files.Move(ctx, []string{uploaded.ID}, sub); err != nil {
				return err
			}
			_, err := find(sub, "renamed.bin")
			return err
		}},
	}
	var failed error
	for _, s := range steps {
		if failed = step(s.name, s.run); failed != nil {
			break
		}
	}
	if root != "" {
		if err := step("把测试目录删到回收站", func() error { return files.Delete(ctx, []string{root}, media.ID) }); err != nil && failed == nil {
			failed = err
		}
	}
	if failed != nil {
		return fmt.Errorf("115 写操作自检未通过")
	}
	fmt.Println("115 写操作自检全部通过")
	return nil
}

package api

import (
	"net/url"
	"strings"
	"testing"
)

func TestRewritePlaylistProxiesEveryURL(t *testing.T) {
	signer := newHLSSigner()
	base, _ := url.Parse("https://cdn.example/video/index.m3u8?t=1")
	body := "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXTINF:10,\nseg-1.ts\nhttps://other.example/seg-2.ts\n"
	got := string(rewritePlaylist([]byte(body), base, signer))
	for _, address := range []string{"https://cdn.example/video/key.bin", "https://cdn.example/video/seg-1.ts", "https://other.example/seg-2.ts"} {
		if !strings.Contains(got, signer.proxyURL(address)) {
			t.Fatalf("playlist lacks proxied %s:\n%s", address, got)
		}
	}
	if !signer.valid("https://cdn.example/video/seg-1.ts", signer.sign("https://cdn.example/video/seg-1.ts")) ||
		signer.valid("https://evil.example/", signer.sign("https://cdn.example/video/seg-1.ts")) {
		t.Fatal("signature check is wrong")
	}
}

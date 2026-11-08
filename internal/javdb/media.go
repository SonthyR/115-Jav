package javdb

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-resty/resty/v2"
	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/netx"
)

const (
	// maxMediaBytes bounds one image response; covers and previews are far smaller.
	maxMediaBytes = 10 << 20
	// maxMediaFetches bounds concurrent image transfers so a poster wall cannot
	// hold an unbounded number of buffered responses.
	maxMediaFetches = 8
)

// newMediaClient refuses private and loopback targets at dial time, so the
// image proxy cannot be pointed at the local network.
func newMediaClient(options Options) *resty.Client {
	return resty.New().
		SetTimeout(options.Timeout).
		SetTransport(netx.NewSafeTransport(options.Proxy)).
		SetResponseBodyLimit(maxMediaBytes).
		SetHeader("User-Agent", userAgent).
		SetRedirectPolicy(resty.NoRedirectPolicy())
}

// FetchMedia downloads and decodes a CDN image independently of API route
// selection and API rate limiting.
func (c *Client) FetchMedia(ctx context.Context, rawURL string) (domain.Media, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return domain.Media{}, errors.New("JavDB media URL must be an absolute https URL")
	}
	// Direct connections are checked again at dial time; this also covers a
	// proxied request naming a local address outright.
	host := parsed.Hostname()
	if ip := net.ParseIP(host); strings.EqualFold(host, "localhost") || ip != nil && netx.IsPrivateOrLoopbackIP(ip) {
		return domain.Media{}, errors.New("JavDB media URL must not target a local address")
	}

	select {
	case c.mediaSlots <- struct{}{}:
		defer func() { <-c.mediaSlots }()
	case <-ctx.Done():
		return domain.Media{}, ctx.Err()
	}
	response, err := c.media.R().SetContext(ctx).Get(rawURL)
	if err != nil {
		return domain.Media{}, fmt.Errorf("download JavDB image: %w", err)
	}
	if response.StatusCode() < 200 || response.StatusCode() >= 300 {
		return domain.Media{}, &HTTPError{StatusCode: response.StatusCode()}
	}
	return decodeImagePayload(response.Body())
}

// The CDN serves either a standard image or a one-byte XOR key followed by the
// encoded image. Detect the decoded MIME type instead of forwarding octet-stream.
func decodeImagePayload(raw []byte) (domain.Media, error) {
	contentType := http.DetectContentType(raw)
	if strings.HasPrefix(contentType, "image/") {
		return domain.Media{ContentType: contentType, Body: raw}, nil
	}
	if len(raw) < 2 {
		return domain.Media{}, errors.New("JavDB media response is not a recognized image")
	}

	key := raw[0]
	decoded := make([]byte, len(raw)-1)
	for index := range decoded {
		decoded[index] = raw[index+1] ^ key
	}
	contentType = http.DetectContentType(decoded)
	if !strings.HasPrefix(contentType, "image/") {
		return domain.Media{}, errors.New("JavDB media response is not a recognized image")
	}
	return domain.Media{ContentType: contentType, Body: decoded}, nil
}

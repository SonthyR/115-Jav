package api

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// AvatarSource supplies actor portraits from the GFriends collection.
type AvatarSource interface {
	CachedAvatar(ctx context.Context, name string) ([]byte, error)
}

func actorAvatarHandler(avatars AvatarSource) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := strings.TrimSpace(c.Query("name"))
		if avatars == nil || name == "" || len(name) > 200 {
			c.Status(http.StatusNotFound)
			return
		}
		data, err := avatars.CachedAvatar(c.Request.Context(), name)
		if errors.Is(err, os.ErrNotExist) {
			c.Header("Cache-Control", "private, max-age=3600")
			c.Status(http.StatusNotFound)
			return
		}
		if err != nil || len(data) == 0 {
			c.Status(http.StatusBadGateway)
			return
		}
		c.Header("Cache-Control", "private, max-age=604800")
		c.Data(http.StatusOK, http.DetectContentType(data), data)
	}
}

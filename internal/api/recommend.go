package api

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/ppxb/miyabi/internal/recommend"
)

// Recommender picks JavDB films the library lacks from what it holds.
type Recommender interface {
	Recommendations(ctx context.Context, refresh bool) (recommend.Result, error)
}

func recommendationsHandler(recommender Recommender) gin.HandlerFunc {
	return func(c *gin.Context) {
		query, ok := bindQuery[struct {
			Refresh bool `form:"refresh"`
		}](c)
		if !ok {
			return
		}
		result, err := recommender.Recommendations(c.Request.Context(), query.Refresh)
		respond(c, result, err)
	}
}

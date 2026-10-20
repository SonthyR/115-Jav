package api

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/ppxb/miyabi/internal/organize"
)

// OrganizeManager reads and saves the 115 organizing rules and runs them.
type OrganizeManager interface {
	Config(context.Context) (organize.Config, error)
	UpdateConfig(context.Context, organize.Config) (organize.Config, error)
	Log(context.Context) ([]organize.Entry, error)
	Trigger(context.Context)
}

func organizeConfigHandler(manager OrganizeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg, err := manager.Config(c.Request.Context())
		respond(c, cfg, err)
	}
}

func organizeUpdateHandler(manager OrganizeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg, ok := bindJSON[organize.Config](c)
		if !ok {
			return
		}
		updated, err := manager.UpdateConfig(c.Request.Context(), cfg)
		respond(c, updated, err)
	}
}

func organizeLogHandler(manager OrganizeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		entries, err := manager.Log(c.Request.Context())
		if entries == nil {
			entries = []organize.Entry{}
		}
		respond(c, entries, err)
	}
}

func organizeRunHandler(manager OrganizeManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		manager.Trigger(c.Request.Context())
		accepted(c, gin.H{"started": true}, nil)
	}
}

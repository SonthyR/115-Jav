package api

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/ppxb/miyabi/internal/catalogue"
)

// JavDBAccountManager reads and updates the JavDB login used by the catalogue.
type JavDBAccountManager interface {
	JavDBAccount(context.Context) (catalogue.JavDBAccount, error)
	UpdateJavDBAccount(context.Context, string, string) error
}

type javdbAccountInput struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func javdbAccountHandler(manager JavDBAccountManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		account, err := manager.JavDBAccount(c.Request.Context())
		respond(c, account, err)
	}
}

func javdbAccountUpdateHandler(manager JavDBAccountManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		input, ok := bindJSON[javdbAccountInput](c)
		if !ok {
			return
		}
		if err := manager.UpdateJavDBAccount(c.Request.Context(), input.Username, input.Password); err != nil {
			c.Error(err)
			return
		}
		account, err := manager.JavDBAccount(c.Request.Context())
		respond(c, account, err)
	}
}

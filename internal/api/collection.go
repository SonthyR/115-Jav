package api

import (
	"context"

	"github.com/gin-gonic/gin"
	lib "github.com/ppxb/miyabi/internal/library"
)

type CollectionManager interface {
	Facets(context.Context) (lib.Facets, error)
	Collections(context.Context) ([]lib.Collection, error)
	CreateCollection(context.Context, string) (lib.Collection, error)
	RenameCollection(context.Context, int, string) error
	DeleteCollection(context.Context, int) error
	AddToCollection(context.Context, int, int) error
	RemoveFromCollection(context.Context, int, int) error
	MovieCollections(context.Context, int) ([]int, error)
}

type collectionURI struct {
	ID int `uri:"id" binding:"min=1"`
}

type collectionMovieURI struct {
	ID      int `uri:"id" binding:"min=1"`
	MovieID int `uri:"movieID" binding:"min=1"`
}

type collectionInput struct {
	Name string `json:"name" binding:"required,max=100"`
}

func libraryFacetsHandler(collections CollectionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		facets, err := collections.Facets(c.Request.Context())
		respond(c, facets, err)
	}
}

func collectionListHandler(collections CollectionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		list, err := collections.Collections(c.Request.Context())
		respond(c, list, err)
	}
}

func collectionCreateHandler(collections CollectionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if input, ok := bindJSON[collectionInput](c); ok {
			created, err := collections.CreateCollection(c.Request.Context(), input.Name)
			respond(c, created, err)
		}
	}
}

func collectionRenameHandler(collections CollectionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		uri, ok := bindURI[collectionURI](c)
		if !ok {
			return
		}
		if input, ok := bindJSON[collectionInput](c); ok {
			respond(c, gin.H{}, collections.RenameCollection(c.Request.Context(), uri.ID, input.Name))
		}
	}
}

func collectionDeleteHandler(collections CollectionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if uri, ok := bindURI[collectionURI](c); ok {
			respond(c, gin.H{}, collections.DeleteCollection(c.Request.Context(), uri.ID))
		}
	}
}

func collectionAddHandler(collections CollectionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if uri, ok := bindURI[collectionMovieURI](c); ok {
			respond(c, gin.H{}, collections.AddToCollection(c.Request.Context(), uri.ID, uri.MovieID))
		}
	}
}

func collectionRemoveHandler(collections CollectionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if uri, ok := bindURI[collectionMovieURI](c); ok {
			respond(c, gin.H{}, collections.RemoveFromCollection(c.Request.Context(), uri.ID, uri.MovieID))
		}
	}
}

func movieCollectionsHandler(collections CollectionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if uri, ok := bindURI[libraryMovieURI](c); ok {
			ids, err := collections.MovieCollections(c.Request.Context(), uri.ID)
			respond(c, ids, err)
		}
	}
}

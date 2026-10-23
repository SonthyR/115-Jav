package library

import (
	"context"
	"fmt"
	"strings"

	"github.com/ppxb/miyabi/internal/domain"
	"github.com/ppxb/miyabi/internal/ent"
	"github.com/ppxb/miyabi/internal/ent/collection"
	"github.com/ppxb/miyabi/internal/ent/collectionitem"
	"github.com/ppxb/miyabi/internal/ent/movie"
)

type Collection struct {
	ID    int     `json:"id"`
	Name  string  `json:"name"`
	Count int     `json:"count"`
	Cover *string `json:"cover,omitempty"`
}

// Collections lists the collections, newest first, with the cover of the
// movie added last.
func (s *Service) Collections(ctx context.Context) ([]Collection, error) {
	scope := libraryScope(s.Source())
	records, err := s.database.Collection.Query().Order(ent.Desc(collection.FieldID)).
		WithItems(func(query *ent.CollectionItemQuery) {
			query.Where(collectionitem.HasMovieWith(movie.HasFilesWith(scope))).
				Order(ent.Desc(collectionitem.FieldID)).WithMovie(func(query *ent.MovieQuery) {
				query.Select(movie.FieldID, movie.FieldCover)
			})
		}).All(ctx)
	if err != nil {
		return nil, fmt.Errorf("list collections: %w", err)
	}
	result := make([]Collection, 0, len(records))
	for _, record := range records {
		item := Collection{ID: record.ID, Name: record.Name, Count: len(record.Edges.Items)}
		if item.Count > 0 {
			item.Cover = record.Edges.Items[0].Edges.Movie.Cover
		}
		result = append(result, item)
	}
	return result, nil
}

func collectionName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", domain.E(domain.KindInvalid, "收藏夹名称不能为空", nil)
	}
	return name, nil
}

func (s *Service) CreateCollection(ctx context.Context, name string) (Collection, error) {
	name, err := collectionName(name)
	if err != nil {
		return Collection{}, err
	}
	record, err := s.database.Collection.Create().SetName(name).Save(ctx)
	if err != nil {
		return Collection{}, fmt.Errorf("create collection: %w", err)
	}
	return Collection{ID: record.ID, Name: record.Name}, nil
}

func (s *Service) RenameCollection(ctx context.Context, id int, name string) error {
	name, err := collectionName(name)
	if err != nil {
		return err
	}
	return collectionError(s.database.Collection.UpdateOneID(id).SetName(name).Exec(ctx))
}

func (s *Service) DeleteCollection(ctx context.Context, id int) error {
	return collectionError(s.database.Collection.DeleteOneID(id).Exec(ctx))
}

func (s *Service) AddToCollection(ctx context.Context, id, movieID int) error {
	if _, err := s.detailRecord(ctx, movieID); err != nil {
		return err
	}
	err := s.database.CollectionItem.Create().SetCollectionID(id).SetMovieID(movieID).
		OnConflictColumns(collectionitem.FieldCollectionID, collectionitem.FieldMovieID).Ignore().Exec(ctx)
	if ent.IsConstraintError(err) {
		return domain.E(domain.KindNotFound, "收藏夹不存在", err)
	}
	return collectionError(err)
}

func (s *Service) RemoveFromCollection(ctx context.Context, id, movieID int) error {
	_, err := s.database.CollectionItem.Delete().
		Where(collectionitem.CollectionIDEQ(id), collectionitem.MovieIDEQ(movieID)).Exec(ctx)
	return collectionError(err)
}

// MovieCollections lists the IDs of the collections holding a movie.
func (s *Service) MovieCollections(ctx context.Context, movieID int) ([]int, error) {
	ids, err := s.database.CollectionItem.Query().Where(collectionitem.MovieIDEQ(movieID)).
		Select(collectionitem.FieldCollectionID).Ints(ctx)
	if err != nil {
		return nil, fmt.Errorf("list movie collections: %w", err)
	}
	return ids, nil
}

func collectionError(err error) error {
	if ent.IsNotFound(err) {
		return domain.E(domain.KindNotFound, "收藏夹不存在", err)
	}
	if err != nil {
		return fmt.Errorf("update collection: %w", err)
	}
	return nil
}

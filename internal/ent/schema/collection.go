package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Collection is a user-made list of library movies.
type Collection struct {
	ent.Schema
}

func (Collection) Mixin() []ent.Mixin {
	return []ent.Mixin{TimeMixin{}}
}

func (Collection) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty().MaxLen(100),
	}
}

func (Collection) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("items", CollectionItem.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

// CollectionItem keeps when a movie was added, which orders a collection.
type CollectionItem struct {
	ent.Schema
}

func (CollectionItem) Mixin() []ent.Mixin {
	return []ent.Mixin{TimeMixin{}}
}

func (CollectionItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("collection_id").Positive(),
		field.Int("movie_id").Positive(),
	}
}

func (CollectionItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("collection", Collection.Type).Ref("items").Field("collection_id").Unique().Required(),
		edge.From("movie", Movie.Type).Ref("collection_items").Field("movie_id").Unique().Required(),
	}
}

func (CollectionItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("collection_id", "movie_id").Unique(),
	}
}

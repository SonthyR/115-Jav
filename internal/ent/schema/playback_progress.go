package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// PlaybackProgress is where web playback of a movie stopped, one row per movie.
type PlaybackProgress struct {
	ent.Schema
}

func (PlaybackProgress) Mixin() []ent.Mixin {
	return []ent.Mixin{TimeMixin{}}
}

func (PlaybackProgress) Fields() []ent.Field {
	return []ent.Field{
		field.Int("movie_id").Positive().Unique(),
		field.String("file_id").NotEmpty(),
		field.Float("position").Min(0),
		field.Float("duration").Min(0),
	}
}

func (PlaybackProgress) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("movie", Movie.Type).
			Ref("progress").
			Field("movie_id").
			Unique().
			Required(),
	}
}

func (PlaybackProgress) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("updated_at"),
	}
}

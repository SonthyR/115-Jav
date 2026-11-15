import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { JavDBEntityType, JavDBZone } from '@/api/discover'
import { Badge } from '@/components/ui/badge'
import { cn } from 'cn'
import { MetadataLink } from './metadata-link'

type MetadataEntity = { provider?: string; id?: string; name: string }

export type MovieMetadataValues = {
  maker?: MetadataEntity
  series?: MetadataEntity
  director?: MetadataEntity
  actors: MetadataEntity[]
  tags: MetadataEntity[]
  zone?: JavDBZone | 'unknown'
}

// Library details link names to the library's own profile pages instead of JavDB.
export function MovieMetadata({
  movie,
  library = false,
  showActors = true,
  showTags = true,
  className
}: {
  movie: MovieMetadataValues
  library?: boolean
  showActors?: boolean
  showTags?: boolean
  className?: string
}) {
  const EntityLink = library ? LibraryEntityLink : CatalogueEntityLink
  return (
    <dl className={cn('divide-y divide-border/60 border-y border-border/60 text-sm', className)}>
      {movie.maker ? (
        <EntityRow label="厂牌">
          <EntityLink kind="maker" entity={movie.maker} />
        </EntityRow>
      ) : null}
      {movie.series ? (
        <EntityRow label="系列">
          <EntityLink kind="series" entity={movie.series} />
        </EntityRow>
      ) : null}
      {showActors && movie.actors.length > 0 ? (
        <EntityRow label="演员">
          {movie.actors.map((actor, index) => (
            <span
              key={`${actor.provider}:${actor.id || actor.name}:${index}`}
              className="inline-flex max-w-full items-center gap-3"
            >
              {index > 0 ? <span className="text-muted-foreground">/</span> : null}
              <EntityLink kind="actor" entity={actor} />
            </span>
          ))}
        </EntityRow>
      ) : null}
      {movie.director ? (
        <EntityRow label="导演">
          <EntityLink kind="director" entity={movie.director} />
        </EntityRow>
      ) : null}
      {showTags && movie.tags.length > 0 ? (
        <EntityRow label="标签">
          <MovieTagRow tags={movie.tags} library={library} zone={movie.zone} />
        </EntityRow>
      ) : null}
    </dl>
  )
}

// Tags sit with the title on both the page and the dialog, while the rest of
// the metadata stays in its quieter table.
export function MovieTagRow({
  tags,
  library = false,
  zone
}: {
  tags: MetadataEntity[]
  library?: boolean
  zone?: JavDBZone | 'unknown'
}) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag, index) => {
        const key = `${tag.provider}:${tag.id || tag.name}:${index}`
        if (library) {
          return (
            <Badge
              key={key}
              variant="outline"
              className="h-6 max-w-full rounded-full border-foreground/15 bg-foreground/[0.035] px-2.5 text-xs break-words whitespace-normal"
              asChild
            >
              <Link to="/browse/$kind/$name" params={{ kind: 'tag', name: tag.name }}>
                {tag.name}
              </Link>
            </Badge>
          )
        }
        if (!tag.id || tag.provider !== 'javdb' || zone === 'unknown') {
          return (
            <Badge
              key={key}
              variant="outline"
              className="h-6 max-w-full rounded-full border-foreground/15 bg-foreground/[0.035] px-2.5 text-xs break-words whitespace-normal"
            >
              {tag.name}
            </Badge>
          )
        }
        return <MetadataLink key={key} kind="tag" id={tag.id} name={tag.name} zone={zone} badge />
      })}
    </div>
  )
}

// Catalogue rows carry no plot text, so the synopsis uses the descriptive
// metadata that is available without inventing a story.
export function MovieSynopsis({ movie }: { movie: MovieMetadataValues }) {
  const parts: string[] = []
  if (movie.series) parts.push(`收录于「${movie.series.name}」系列`)
  if (movie.maker) parts.push(`${movie.maker.name} 出品`)
  if (movie.director) parts.push(`由 ${movie.director.name} 导演`)
  if (movie.actors.length > 0) {
    const names = movie.actors
      .slice(0, 3)
      .map(actor => actor.name)
      .join('、')
    parts.push(movie.actors.length > 3 ? `${names} 等出演` : `${names} 出演`)
  }
  if (movie.tags.length > 0) {
    parts.push(
      `标签包括 ${movie.tags
        .slice(0, 4)
        .map(tag => tag.name)
        .join('、')}`
    )
  }
  return (
    <p className="max-w-[44rem] text-sm leading-7 text-muted-foreground">
      {parts.length > 0 ? `${parts.join('，')}。` : '暂无简介。'}
    </p>
  )
}

function LibraryEntityLink({ kind, entity }: { kind: JavDBEntityType; entity: MetadataEntity }) {
  if (kind === 'director') return <span className="max-w-full break-words">{entity.name}</span>
  return (
    <Link
      to="/browse/$kind/$name"
      params={{ kind, name: entity.name }}
      className="max-w-full break-words outline-ring transition-colors hover:text-muted-foreground"
    >
      {entity.name}
    </Link>
  )
}

function CatalogueEntityLink({ kind, entity }: { kind: JavDBEntityType; entity: MetadataEntity }) {
  return entity.id && entity.provider === 'javdb' ? (
    <MetadataLink kind={kind} id={entity.id} name={entity.name} />
  ) : (
    <span className="max-w-full break-words">{entity.name}</span>
  )
}

function EntityRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-3 py-2.5">
      <dt className="pt-0.5 font-mono text-[11px] leading-5 tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 leading-6">{children}</dd>
    </div>
  )
}

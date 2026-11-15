import { PlayIcon, StarIcon } from 'lucide-react'

import type { DiscoverMovie } from '@/api/discover'
import { useMovieState } from '@/api/movie-states'
import { MediaImage } from '@/components/media-image'
import {
  MovieResourceBadges,
  MovieStateBadge,
  ResourceBadgeLimitContext
} from '@/components/movie/movie-badges'
import { OverflowTooltip } from '@/components/overflow-tooltip'
import { MovieDetailTrigger } from '@/features/movie-detail/detail-trigger'
import { MovieOfflineButton } from './movie-offline-button'
import { MovieSubscribeButton } from './movie-subscribe-button'

export function DiscoverMovieCard({ movie }: { movie: DiscoverMovie }) {
  const title = movie.title || movie.code

  return (
    <MovieDetailTrigger
      movie={{ id: movie.id }}
      className="group block h-full min-w-0 rounded-[9px] outline-ring focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <article className="flex h-full min-w-0 flex-col">
        <div className="relative aspect-2/3 overflow-hidden rounded-[9px] bg-muted ring-1 ring-border transition-[ring-color] duration-200 group-hover:ring-foreground/25 motion-reduce:transition-none">
          <MediaImage
            source={movie.thumbnail || movie.cover}
            width={360}
            alt={title}
            className="object-cover transition-[transform,filter] duration-300 group-hover:scale-[1.025] group-hover:brightness-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />

          <span className="pointer-events-none absolute top-2 left-2 z-20 max-w-[calc(100%-3.5rem)] truncate rounded-[4px] border border-white/20 bg-black/35 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.03em] text-white/90 backdrop-blur-sm">
            {movie.code}
          </span>

          <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center bg-linear-to-t from-black/70 via-black/5 to-transparent opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:hover)]:flex">
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-black shadow-sm">
              <PlayIcon className="size-4 translate-x-px fill-current" />
            </span>
            <span className="sr-only">查看详情</span>
          </div>

          <div className="absolute top-2 right-2 z-30">
            <DiscoverMovieAction movie={movie} />
          </div>
        </div>

        <div className="min-w-0 px-0.5 pt-2.5 pb-1">
          <OverflowTooltip content={title}>
            <h3 className="truncate text-sm leading-5 font-medium">{title}</h3>
          </OverflowTooltip>
          <p className="mt-1 flex items-center gap-2 truncate font-mono text-[10px] tracking-[0.03em] text-muted-foreground tabular-nums">
            <span>{movie.release_date || '发行日期待定'}</span>
            {movie.rating > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5">
                <StarIcon className="size-2.5 fill-current" />
                {movie.rating.toFixed(1)}
              </span>
            ) : null}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <MovieStateBadge movie={movie} />
            <ResourceBadgeLimitContext value={2}>
              <MovieResourceBadges movie={movie} />
            </ResourceBadgeLimitContext>
          </div>
        </div>
      </article>
    </MovieDetailTrigger>
  )
}

export function DiscoverMovieAction({
  movie,
  showLabel = false
}: {
  movie: DiscoverMovie
  showLabel?: boolean
}) {
  const { state, isPlaceholderData } = useMovieState(movie)
  const subscribable = movie.release_status === 'upcoming' && movie.magnets_count === 0
  const downloadable =
    movie.release_status !== 'upcoming' &&
    movie.magnets_count > 0 &&
    !isPlaceholderData &&
    state === 'not_in_library'

  if (subscribable) return <MovieSubscribeButton movie={movie} showLabel={showLabel} />
  if (downloadable) return <MovieOfflineButton movie={movie} showLabel={showLabel} />
  return null
}

import { Link } from '@tanstack/react-router'
import {
  CalendarIcon,
  ClockIcon,
  Ellipsis,
  PlayIcon,
  StarIcon,
  type LucideIcon
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { DiscoverMovie, DiscoverMovieDetail } from '@/api/discover'
import type { LibraryMovieDetail } from '@/api/library'
import { MediaImage } from '@/components/media-image'
import { MovieResourceBadges, MovieStateBadge } from '@/components/movie/movie-badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CollectionButton } from '@/features/collections/collection-button'
import { LibraryMovieActions } from '@/features/library/movie-actions'
import { MovieMetadata, MovieSynopsis, MovieTagRow } from './metadata'
import { MovieSubscriptionAction } from './subscription-action'

export function MovieHero({
  movie,
  libraryStatus,
  player,
  onPlay
}: {
  movie: DiscoverMovieDetail | LibraryMovieDetail
  libraryStatus?: LibraryMovieDetail['scrape_status']
  // The player replaces the cover in place once playback starts.
  player?: ReactNode
  onPlay?: () => void
}) {
  const library = 'library_id' in movie
  const year = movie.release_date?.slice(0, 4)
  return (
    <section className="space-y-7">
      {player ? (
        <div className="overflow-hidden rounded-xl bg-black ring-1 ring-foreground/10">
          {player}
        </div>
      ) : (
        <div className="relative isolate min-h-[16.5rem] overflow-hidden rounded-xl bg-black sm:min-h-[21rem]">
          <MediaImage
            source={movie.cover}
            width={720}
            loading="eager"
            alt=""
            className="object-cover object-center"
          />
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.045)_0_1px,transparent_1px_3px)] opacity-25" />
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black via-black/35 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-black/55 via-transparent to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 pr-14 sm:pr-4">
            <Badge
              variant="frosted"
              className="h-6 rounded-full border-white/20 bg-black/35 px-2.5 font-mono text-[11px] text-white"
            >
              {movie.code}
            </Badge>
            <div className="flex flex-wrap justify-end gap-1.5">
              {libraryStatus ? (
                <Badge variant={libraryStatus === 'done' ? 'library' : 'secondary'}>
                  {{ done: '已入库', pending: '待刮削', failed: '刮削失败' }[libraryStatus]}
                </Badge>
              ) : (
                <MovieStateBadge movie={movie} hideViewed />
              )}
            </div>
          </div>
          {onPlay ? (
            <button
              type="button"
              aria-label="播放"
              className="group absolute top-1/2 left-1/2 flex size-16 -translate-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-2xl backdrop-blur-md transition-[transform,background-color] hover:scale-105 hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none sm:size-20"
              onClick={onPlay}
            >
              <PlayIcon className="size-7 translate-x-0.5 fill-current sm:size-9" />
            </button>
          ) : null}
        </div>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)] lg:gap-12">
        <div className="min-w-0 space-y-5">
          <div className="space-y-2.5">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              <span className="text-foreground">{movie.code}</span>
              {year ? <span>{year}</span> : null}
              <span>
                {library
                  ? libraryStatus === 'pending'
                    ? 'metadata pending'
                    : 'library edition'
                  : 'catalogue edition'}
              </span>
            </p>
            <h1 className="font-serif text-[clamp(2rem,4.5vw,3.35rem)] leading-[1.08] font-semibold tracking-[-0.025em]">
              {movie.title || movie.code}
            </h1>
            {movie.origin_title && movie.origin_title !== movie.title ? (
              <p className="text-sm leading-6 text-muted-foreground">{movie.origin_title}</p>
            ) : null}
          </div>

          <MovieStats movie={movie} />

          <MovieTagRow
            tags={movie.tags}
            library={library}
            zone={'zone' in movie ? movie.zone : undefined}
          />

          <MovieSynopsis movie={movie} />

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {library && onPlay ? (
              <Button asChild size="lg" className="h-10 px-5">
                <Link to="/play/$id" params={{ id: String(movie.library_id) }}>
                  <PlayIcon data-icon="inline-start" className="fill-current" />
                  播放
                </Link>
              </Button>
            ) : null}
            {library && onPlay && !player ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-10 px-4"
                onClick={onPlay}
              >
                <PlayIcon data-icon="inline-start" className="fill-current" />
                在此播放
              </Button>
            ) : null}
            {library ? <CollectionButton movieId={movie.library_id} look="icon" /> : null}
            {movie.id ? <MovieSubscriptionAction movieID={movie.id} look="action" /> : null}
            {library ? (
              <LibraryMovieActions
                movie={{ id: movie.library_id, code: movie.code }}
                disabled={movie.scrape_status === 'pending'}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    title="管理：重新刮削、纠正番号"
                    aria-label="更多"
                  >
                    <Ellipsis />
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium tracking-[0.08em]">影片资料</h2>
            <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
              {movie.code}
            </span>
          </div>
          <MovieMetadata movie={movie} library={library} showTags={false} />
          {!library ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <MovieResourceBadges movie={movie} />
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}

export function MovieStats({
  movie
}: {
  movie: Pick<
    DiscoverMovie,
    'release_date' | 'duration' | 'rating' | 'rating_source' | 'rating_max'
  >
}) {
  const stats: Array<{ label: string; value: string; icon?: LucideIcon }> = []
  if (movie.release_date) {
    stats.push({ label: '发行日期', value: movie.release_date, icon: CalendarIcon })
  }
  if (movie.duration > 0) {
    stats.push({ label: '片长', value: `${movie.duration} 分钟`, icon: ClockIcon })
  }
  if (movie.rating > 0) {
    const source = movie.rating_source === 'javdb' ? 'JavDB' : movie.rating_source?.toUpperCase()
    stats.push({
      label: source ? `${source} 评分` : '评分',
      value: movie.rating_max
        ? `${movie.rating.toFixed(1)} / ${movie.rating_max}`
        : movie.rating.toFixed(1),
      icon: StarIcon
    })
  }
  if (stats.length === 0) return null

  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs tracking-[0.02em] text-muted-foreground tabular-nums">
      {stats.map(stat => (
        <div key={stat.label} className="flex min-w-0 items-center gap-1.5" title={stat.label}>
          {stat.icon ? <stat.icon className="size-3.5 shrink-0" strokeWidth={1.5} /> : null}
          <dt className="sr-only">{stat.label}</dt>
          <dd className="truncate">{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}

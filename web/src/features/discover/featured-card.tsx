import { CalendarIcon, StarIcon } from 'lucide-react'

import type { DiscoverMovie } from '@/api/discover'
import { MediaImage } from '@/components/media-image'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MovieDetailTrigger } from '@/features/movie-detail/detail-trigger'
import { DiscoverMovieAction } from './movie-card'

const chipClass =
  'inline-flex h-6 items-center rounded-full border border-white/20 bg-black/25 px-2.5 text-[11px] tracking-[0.05em] text-white/85 backdrop-blur-sm'

export function DiscoverFeatureCard({ movie }: { movie: DiscoverMovie }) {
  const title = movie.title || movie.code
  const year = movie.release_date?.slice(0, 4)
  const actors = movie.actors
    .map(actor => actor.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ')

  return (
    <MovieDetailTrigger
      movie={{ id: movie.id }}
      className="group block rounded-[16px] outline-ring focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <section className="relative isolate min-h-[20rem] overflow-hidden rounded-[16px] border border-white/10 bg-black md:min-h-[23rem]">
        <div className="absolute inset-0 -z-20">
          <MediaImage
            source={movie.cover}
            width={720}
            loading="eager"
            alt=""
            className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.05)_0_1px,transparent_1px_3px)] opacity-20" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-t from-black via-black/55 to-black/5" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-black/75 via-black/25 to-transparent" />

        <div className="relative z-10 flex min-h-[20rem] max-w-[680px] flex-col justify-end gap-4 p-5 text-white md:min-h-[23rem] md:p-9">
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="text-gold">Featured / latest</span>
            <span className="text-white/35">JavDB</span>
          </p>

          <div className="flex flex-wrap gap-1.5">
            <span className={chipClass}>{releaseLabel(movie)}</span>
            {movie.magnets_count > 0 ? <span className={chipClass}>含磁力</span> : null}
            {movie.has_subtitle ? <span className={chipClass}>字幕</span> : null}
            {movie.has_preview ? <span className={chipClass}>有预览</span> : null}
          </div>

          <div className="space-y-2">
            <p className="font-mono text-[11px] tracking-[0.08em] text-white/60">{movie.code}</p>
            <h2 className="line-clamp-2 max-w-[620px] font-serif text-[clamp(1.8rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.025em]">
              {title}
            </h2>
            {actors ? (
              <p className="truncate text-xs tracking-[0.03em] text-white/65">{actors}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] tracking-[0.03em] text-white/65 tabular-nums">
            {movie.release_date ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarIcon className="size-3" strokeWidth={1.6} />
                {movie.release_date}
              </span>
            ) : null}
            {year && !movie.release_date ? <span>{year}</span> : null}
            {movie.duration > 0 ? <span>{movie.duration} 分钟</span> : null}
            {movie.rating > 0 ? (
              <span className="inline-flex items-center gap-1 text-white">
                <StarIcon className="size-3 fill-current" strokeWidth={1.6} />
                {movie.rating.toFixed(1)}
              </span>
            ) : null}
          </div>

          <p className="max-w-[520px] text-xs leading-6 text-white/60">
            来自 JavDB 的最新发行。含磁力的作品可以直接加入 115，其余作品会保留在发现中。
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-10 bg-white px-4 text-xs text-black hover:bg-white/90"
            >
              查看详情
            </Button>
            <DiscoverMovieAction movie={movie} showLabel />
          </div>
        </div>
      </section>
    </MovieDetailTrigger>
  )
}

export function DiscoverFeatureSkeleton() {
  return (
    <div
      className="relative min-h-[20rem] overflow-hidden rounded-[16px] border border-border bg-card md:min-h-[23rem]"
      aria-hidden="true"
    >
      <Skeleton className="absolute inset-0 rounded-none" />
      <div className="relative flex min-h-[20rem] flex-col justify-end gap-4 p-5 md:min-h-[23rem] md:p-9">
        <Skeleton className="h-2.5 w-40" />
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
        <Skeleton className="h-10 w-4/5 max-w-[560px]" />
        <Skeleton className="h-3 w-48" />
        <div className="flex gap-2.5">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-24 rounded-full" />
        </div>
      </div>
    </div>
  )
}

function releaseLabel(movie: DiscoverMovie) {
  if (movie.release_status === 'upcoming') return '即将发行'
  if (movie.release_status === 'released') return '已发行'
  return '发行状态未知'
}

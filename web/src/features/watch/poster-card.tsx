import { Link } from '@tanstack/react-router'
import { CheckIcon, PlayIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useLite } from '@/api/auth'
import type { LibraryMovie } from '@/api/library'
import { useMarkPlayed } from '@/api/playback'
import { MediaImage } from '@/components/media-image'
import { CollectionButton } from '@/features/collections/collection-button'
import { cn } from 'cn'

export function PosterGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-3.5 gap-y-7 sm:grid-cols-4 sm:gap-y-9 lg:grid-cols-6">
      {children}
    </div>
  )
}

// A tall poster that opens the movie page. Mouse users get play, watched and
// collect on hover; watched movies carry a thin line along the bottom.
export function PosterCard({ movie, className }: { movie: LibraryMovie; className?: string }) {
  const lite = useLite()
  const source = movie.poster ?? movie.cover
  const year = movie.release_date?.slice(0, 4)
  return (
    <div className={cn('group min-w-0', className)}>
      <div className="relative aspect-2/3 overflow-hidden rounded-[9px] bg-muted">
        <Link
          to="/movie/$id"
          params={{ id: String(movie.id) }}
          className="absolute inset-0 z-10 outline-ring"
        >
          {source ? (
            <MediaImage
              source={source}
              width={360}
              alt={movie.code}
              blurredBackground={!movie.poster}
              className={cn(
                'transition-[transform,filter] duration-200 group-hover:scale-[1.02] group-hover:brightness-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100',
                movie.poster ? 'object-cover' : 'object-contain'
              )}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs tracking-wider text-muted-foreground">
              {movie.code}
            </div>
          )}
        </Link>
        <span className="pointer-events-none absolute top-2 left-2 z-30 rounded-[4px] border border-white/20 bg-black/35 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.03em] text-white/90 backdrop-blur-sm">
          {movie.code}
        </span>
        <div className="pointer-events-none absolute top-2 right-2 z-30 flex gap-1">
          {movie.chinese ? <PosterTag>中字</PosterTag> : null}
          {movie.file_count > 1 ? <PosterTag>{movie.file_count} 个文件</PosterTag> : null}
        </div>
        {movie.played ? (
          <span className="pointer-events-none absolute right-2 bottom-2 left-2 z-30 h-0.5 overflow-hidden rounded-full bg-white/25">
            <span className="block h-full w-full rounded-full bg-gold" />
            <span className="sr-only">看过</span>
          </span>
        ) : null}
        {lite ? null : <PosterActions movie={movie} />}
      </div>
      <div className="mt-3 space-y-1">
        <p className="truncate text-sm">{movie.title || movie.code}</p>
        <p className="truncate font-mono text-[10px] tracking-[0.02em] text-muted-foreground tabular-nums">
          {movie.code}
          {year ? ` · ${year}` : ''}
          {movie.rating > 0 ? ` · ★ ${movie.rating.toFixed(1)}` : ''}
        </p>
      </div>
    </div>
  )
}

export function PosterSkeletons({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <div key={index} className="min-w-0">
      <div className="aspect-2/3 animate-pulse rounded-[9px] bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-3 w-3/4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
      <div className="mt-2 h-2 w-1/2 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
    </div>
  ))
}

function PosterTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[3px] border border-white/20 bg-black/35 px-1.5 py-px font-mono text-[10px] tracking-[0.02em] text-white/90 backdrop-blur-sm">
      {children}
    </span>
  )
}

function PosterActions({ movie }: { movie: LibraryMovie }) {
  const mark = useMarkPlayed(movie.id)
  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden flex-col justify-between bg-linear-to-t from-black/75 via-black/5 to-transparent p-3 opacity-0 transition-opacity duration-200 *:pointer-events-auto group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:hover)]:flex">
      <Link
        to="/play/$id"
        params={{ id: String(movie.id) }}
        aria-label={`播放 ${movie.code}`}
        className="absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black transition-transform duration-200 hover:scale-105 motion-reduce:transition-none"
      >
        <PlayIcon className="size-4 translate-x-px fill-current" />
      </Link>
      <div className="mt-auto flex items-center justify-end gap-2">
        <button
          type="button"
          aria-pressed={!!movie.played}
          title={movie.played ? '看过（再点一下取消）' : '标为看过'}
          disabled={mark.isPending}
          onClick={() => mark.mutate(!movie.played)}
          className={cn(
            'flex size-9 items-center justify-center rounded-full border border-white/35 bg-black/15 text-white backdrop-blur-sm transition-colors hover:border-white',
            movie.played && 'border-gold text-gold hover:border-gold'
          )}
        >
          <CheckIcon className="size-4" strokeWidth={1.75} />
          <span className="sr-only">{movie.played ? '看过' : '标为看过'}</span>
        </button>
        <CollectionButton movieId={movie.id} look="overlay" />
      </div>
    </div>
  )
}

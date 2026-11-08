import { Link } from '@tanstack/react-router'
import { CheckIcon, PlayIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useLite } from '@/api/auth'
import { imageURL } from '@/api/client'
import type { LibraryMovie } from '@/api/library'
import { useMarkPlayed } from '@/api/playback'
import { CollectionButton } from '@/features/collections/collection-button'
import { cn } from 'cn'

export function PosterGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-6">
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
      <div className="relative aspect-2/3 overflow-hidden rounded-md bg-muted">
        <Link
          to="/movie/$id"
          params={{ id: String(movie.id) }}
          className="absolute inset-0 outline-ring"
        >
          {source ? (
            <img
              src={imageURL(source, 360)}
              alt={movie.code}
              loading="lazy"
              decoding="async"
              className={cn(
                'size-full transition duration-500 group-hover:scale-[1.03] group-hover:brightness-110',
                movie.poster ? 'object-cover' : 'object-contain'
              )}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs tracking-wider text-muted-foreground">
              {movie.code}
            </div>
          )}
        </Link>
        <div className="pointer-events-none absolute top-2 left-2 flex gap-1">
          {movie.chinese ? <PosterTag>中字</PosterTag> : null}
          {movie.file_count > 1 ? <PosterTag>{movie.file_count} 个文件</PosterTag> : null}
        </div>
        {movie.played ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gold">
            <span className="sr-only">看过</span>
          </span>
        ) : null}
        {lite ? null : <PosterActions movie={movie} />}
      </div>
      <div className="mt-3 space-y-1">
        <p className="truncate text-sm">{movie.title || movie.code}</p>
        <p className="truncate text-xs tracking-wide text-muted-foreground">
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
      <div className="aspect-2/3 animate-pulse rounded-md bg-muted" />
      <div className="mt-3 h-3.5 w-3/4 animate-pulse rounded-sm bg-muted" />
    </div>
  ))
}

function PosterTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[3px] border border-white/35 bg-black/35 px-1.5 py-px text-[10px] tracking-wider text-white backdrop-blur-sm">
      {children}
    </span>
  )
}

function PosterActions({ movie }: { movie: LibraryMovie }) {
  const mark = useMarkPlayed(movie.id)
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden items-end gap-2 bg-linear-to-t from-black/80 to-transparent p-3 pt-14 opacity-0 transition-opacity duration-300 *:pointer-events-auto group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:flex">
      <Link
        to="/play/$id"
        params={{ id: String(movie.id) }}
        aria-label={`播放 ${movie.code}`}
        className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
      >
        <PlayIcon className="size-3.5 translate-x-px fill-current" />
      </Link>
      <button
        type="button"
        aria-pressed={!!movie.played}
        title={movie.played ? '看过（再点一下取消）' : '标为看过'}
        disabled={mark.isPending}
        onClick={() => mark.mutate(!movie.played)}
        className={cn(
          'flex size-9 items-center justify-center rounded-full border border-white/40 text-white transition-colors hover:border-white',
          movie.played && 'border-gold text-gold hover:border-gold'
        )}
      >
        <CheckIcon className="size-4" strokeWidth={1.75} />
        <span className="sr-only">{movie.played ? '看过' : '标为看过'}</span>
      </button>
      <CollectionButton movieId={movie.id} look="overlay" />
    </div>
  )
}

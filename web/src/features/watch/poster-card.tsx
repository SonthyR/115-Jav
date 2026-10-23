import { Link } from '@tanstack/react-router'
import { PlayIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { imageURL } from '@/api/client'
import type { LibraryMovie } from '@/api/library'
import { cn } from 'cn'

export function PosterGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {children}
    </div>
  )
}

// A tall poster opens the movie page; its play button starts playback directly.
export function PosterCard({ movie, className }: { movie: LibraryMovie; className?: string }) {
  const source = movie.poster ?? movie.cover
  const year = movie.release_date?.slice(0, 4)
  return (
    <div className={cn('group min-w-0', className)}>
      <div className="relative aspect-2/3 overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/5">
        <Link
          to="/movie/$id"
          params={{ id: String(movie.id) }}
          className="absolute inset-0 outline-ring"
        >
          {source ? (
            <img
              src={imageURL(source)}
              alt={movie.code}
              loading="lazy"
              decoding="async"
              className={cn(
                'size-full transition-transform duration-300 group-hover:scale-105',
                movie.poster ? 'object-cover' : 'object-contain'
              )}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              {movie.code}
            </div>
          )}
        </Link>
        {movie.file_count > 1 ? (
          <span className="pointer-events-none absolute top-1.5 right-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] text-white">
            {movie.file_count} 个文件
          </span>
        ) : null}
        <Link
          to="/play/$id"
          params={{ id: String(movie.id) }}
          aria-label={`播放 ${movie.code}`}
          className="absolute top-1/2 left-1/2 hidden size-12 -translate-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
        >
          <PlayIcon className="size-5 translate-x-px fill-current" />
        </Link>
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="line-clamp-2 text-sm leading-5 font-medium">{movie.title || movie.code}</p>
        <p className="truncate text-xs text-muted-foreground">
          {movie.code}
          {year ? ` · ${year}` : ''}
        </p>
      </div>
    </div>
  )
}

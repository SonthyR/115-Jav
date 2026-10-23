import { Link } from '@tanstack/react-router'
import { PlayIcon } from 'lucide-react'

import { imageURL } from '@/api/client'
import { useContinueWatching } from '@/api/playback'
import { formatTime } from '@/features/player/player'
import { Row } from './row'

// Each card resumes playback directly; the details are one tap away from the player.
export function ContinueWatching() {
  const items = useContinueWatching()
  if (!items.data?.length) return null
  return (
    <Row title="继续观看">
      {items.data.map(({ movie, progress }) => (
        <Link
          key={movie.id}
          to="/play/$id"
          params={{ id: String(movie.id) }}
          className="group w-64 shrink-0 snap-start outline-ring sm:w-72"
        >
          <div className="relative aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/5">
            {movie.cover ? (
              <img
                src={imageURL(movie.cover)}
                alt={movie.code}
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : null}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex size-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
                <PlayIcon className="size-5 translate-x-px fill-current" />
              </span>
            </span>
            <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <span
                className="block h-full bg-primary"
                style={{
                  width: `${Math.min(100, (progress.position / progress.duration) * 100)}%`
                }}
              />
            </span>
          </div>
          <p className="mt-2 truncate text-sm font-medium">{movie.title || movie.code}</p>
          <p className="truncate text-xs text-muted-foreground">
            {movie.code} · 看到 {formatTime(progress.position)} / {formatTime(progress.duration)}
          </p>
        </Link>
      ))}
    </Row>
  )
}

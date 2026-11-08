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
          <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
            {movie.cover ? (
              <img
                src={imageURL(movie.cover, 720)}
                alt={movie.code}
                loading="lazy"
                className="size-full object-cover transition duration-500 group-hover:scale-[1.03] group-hover:brightness-110"
              />
            ) : null}
            <span className="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors group-hover:bg-white group-hover:text-black">
              <PlayIcon className="size-3.5 translate-x-px fill-current" />
            </span>
          </div>
          <span className="mt-3 block h-0.5 bg-foreground/12">
            <span
              className="block h-full bg-gold"
              style={{ width: `${Math.min(100, (progress.position / progress.duration) * 100)}%` }}
            />
          </span>
          <p className="mt-3 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{movie.title || movie.code}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              剩 {formatTime(Math.max(0, progress.duration - progress.position))}
            </span>
          </p>
        </Link>
      ))}
    </Row>
  )
}

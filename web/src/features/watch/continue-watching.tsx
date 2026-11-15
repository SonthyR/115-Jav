import { Link } from '@tanstack/react-router'
import { PlayIcon } from 'lucide-react'

import { useContinueWatching } from '@/api/playback'
import { MediaImage } from '@/components/media-image'
import { formatTime } from '@/features/player/player'
import { Row } from './row'

// Each card resumes playback directly; the details are one tap away from the player.
export function ContinueWatching() {
  const items = useContinueWatching()
  if (!items.data?.length) return null
  return (
    <Row title="继续观看">
      {items.data.map(({ movie, progress }) => {
        const percent =
          progress.duration > 0
            ? Math.max(0, Math.min(100, (progress.position / progress.duration) * 100))
            : 0
        return (
          <Link
            key={movie.id}
            to="/play/$id"
            params={{ id: String(movie.id) }}
            aria-label={`继续播放 ${movie.title || movie.code}`}
            className="group w-60 shrink-0 snap-start outline-ring sm:w-72"
          >
            <div className="relative aspect-video overflow-hidden rounded-[9px] bg-muted">
              {movie.cover ? (
                <MediaImage
                  source={movie.cover}
                  width={720}
                  alt={movie.code}
                  className="object-cover transition-[transform,filter] duration-300 group-hover:scale-[1.02] group-hover:brightness-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              ) : null}
              <span className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/25">
                <span className="block h-full bg-gold" style={{ width: `${percent}%` }} />
              </span>
              <span className="absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:hidden">
                <PlayIcon className="size-4 translate-x-px fill-current" />
              </span>
            </div>
            <p className="mt-3 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">{movie.title || movie.code}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                剩 {formatTime(Math.max(0, progress.duration - progress.position))}
              </span>
            </p>
          </Link>
        )
      })}
    </Row>
  )
}

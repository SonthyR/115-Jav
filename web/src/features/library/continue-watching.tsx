import { useContinueWatching } from '@/api/playback'
import { MovieCard } from '@/components/movie'
import { MovieDetailTrigger } from '@/features/movie-detail/detail-trigger'
import { formatTime } from '@/features/player/player'

export function ContinueWatching() {
  const items = useContinueWatching()
  if (!items.data?.length) return null
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">继续观看</h2>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {items.data.map(({ movie, progress }) => (
          <MovieDetailTrigger
            key={movie.id}
            movie={{ libraryId: movie.id, play: true }}
            className="w-56 shrink-0 snap-start rounded-2xl outline-ring sm:w-64"
          >
            <MovieCard
              movie={movie}
              titleTooltip={false}
              description={`看到 ${formatTime(progress.position)} / ${formatTime(progress.duration)}`}
              coverOverlay={
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${Math.min(100, (progress.position / progress.duration) * 100)}%`
                    }}
                  />
                </div>
              }
            />
          </MovieDetailTrigger>
        ))}
      </div>
    </section>
  )
}

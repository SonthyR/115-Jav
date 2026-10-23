import type { LibraryMovie } from '@/api/library'
import { MovieCard } from '@/components/movie'
import { Badge } from '@/components/ui/badge'
import { MovieDetailTrigger } from '@/features/movie-detail/detail-trigger'

// Watching cards open the detail only; rescrape and other actions stay in management.
export function WatchMovieCard({ movie, className }: { movie: LibraryMovie; className?: string }) {
  return (
    <MovieDetailTrigger
      movie={{ libraryId: movie.id }}
      className={className ?? 'block h-full min-w-0 rounded-2xl outline-ring'}
    >
      <MovieCard
        movie={movie}
        titleTooltip={false}
        description={movie.actors.map(actor => actor.name).join(' / ') || undefined}
      >
        {movie.file_count > 1 ? <Badge variant="outline">{movie.file_count} 个文件</Badge> : null}
      </MovieCard>
    </MovieDetailTrigger>
  )
}

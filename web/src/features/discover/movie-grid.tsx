import type { DiscoverMovie } from '@/api/discover'
import { Skeleton } from '@/components/ui/skeleton'
import { DiscoverMovieCard } from './movie-card'

const gridClass =
  'grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-6 lg:gap-x-5 lg:gap-y-9'

export function MovieGrid({ movies }: { movies: DiscoverMovie[] }) {
  return (
    <div className={gridClass}>
      {movies.map(movie => (
        <DiscoverMovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  )
}

export function DiscoverGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={gridClass} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="min-w-0">
          <Skeleton className="aspect-2/3 rounded-[9px]" />
          <div className="space-y-2 px-0.5 pt-2.5">
            <Skeleton className="h-3 w-4/5 rounded-sm" />
            <Skeleton className="h-2 w-3/5 rounded-sm" />
            <Skeleton className="h-5 w-2/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

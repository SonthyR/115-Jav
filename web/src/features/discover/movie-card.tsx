import { StarIcon } from 'lucide-react'

import type { DiscoverMovie } from '@/api/discover'
import { useMovieState } from '@/api/movie-states'
import { MovieCard } from '@/components/movie'
import { MovieResourceBadges, MovieStateBadge } from '@/components/movie/movie-badges'
import { MovieOfflineButton } from './movie-offline-button'
import { MovieSubscribeButton } from './movie-subscribe-button'
import { MovieDetailTrigger } from '@/features/movie-detail/detail-trigger'

export function DiscoverMovieCard({ movie }: { movie: DiscoverMovie }) {
  const { state, isPlaceholderData } = useMovieState(movie)
  const subscribable = movie.release_status === 'upcoming' && movie.magnets_count === 0
  const downloadable =
    movie.release_status !== 'upcoming' &&
    movie.magnets_count > 0 &&
    !isPlaceholderData &&
    state === 'not_in_library'
  const action = subscribable ? (
    <MovieSubscribeButton movie={movie} />
  ) : downloadable ? (
    <MovieOfflineButton movie={movie} />
  ) : null
  return (
    <MovieDetailTrigger movie={{ id: movie.id }} className="block rounded-2xl outline-ring">
      <MovieCard
        movie={movie}
        description={
          <span className="flex items-center gap-2">
            {movie.release_date}
            {movie.rating > 0 ? (
              <span className="flex items-center gap-0.5">
                <StarIcon className="size-3 fill-current" />
                {movie.rating.toFixed(1)}
              </span>
            ) : null}
          </span>
        }
        state={<MovieStateBadge movie={movie} />}
        coverOverlay={action ? <div className="absolute top-2 right-2">{action}</div> : undefined}
      >
        <MovieResourceBadges movie={movie} />
      </MovieCard>
    </MovieDetailTrigger>
  )
}

import type { BrowseMoviesParams } from '@/api/discover'
import { useDiscoverMovies } from '@/api/discover'
import { DiscoverResults } from './results'

export function BrowseResults({
  params,
  featured = false,
  onPageChange
}: {
  params: BrowseMoviesParams & { page: number }
  featured?: boolean
  onPageChange: (page: number) => void
}) {
  const movies = useDiscoverMovies(params)
  return (
    <DiscoverResults
      movies={movies.data}
      loading={movies.isPending}
      fetching={movies.isFetching}
      error={movies.isError}
      searching={false}
      featured={featured}
      page={params.page}
      onPageChange={onPageChange}
      onRetry={() => movies.refetch()}
    />
  )
}

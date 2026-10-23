import type { ReactNode } from 'react'

import {
  LIBRARY_PAGE_SIZE,
  type LibraryFacetKind,
  type LibraryFilter,
  useLibraryMovies
} from '@/api/library'
import { AppPage } from '@/components/app-page'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { ListPagination } from '@/components/list-pagination'
import { MovieGridSkeleton } from '@/components/movie/movie-grid-skeleton'
import { PageHeader } from '@/components/page-header'
import { LibraryFilters } from '@/features/library/filters'
import { PosterCard, PosterGrid } from './poster-card'

export function WatchBrowse({
  page,
  filter,
  onPageChange,
  onFilterChange,
  title,
  description,
  header,
  locked
}: {
  page: number
  filter: LibraryFilter
  onPageChange: (page: number) => void
  onFilterChange: (filter: LibraryFilter) => void
  title: string
  description: string
  header?: ReactNode
  // Profile and collection pages keep their own filter.
  locked?: LibraryFacetKind
}) {
  const library = useLibraryMovies(page, filter)
  return (
    <AppPage>
      <PageHeader title={title} description={description} />
      {header}
      <LibraryFilters filter={filter} locked={locked} onChange={onFilterChange} />
      {library.isPending ? (
        <MovieGridSkeleton count={LIBRARY_PAGE_SIZE} compact />
      ) : library.isError ? (
        <ErrorState
          message="无法读取片库，请检查后端服务后重试"
          onRetry={() => void library.refetch()}
          retrying={library.isFetching}
        />
      ) : (
        <>
          {library.data.movies.length > 0 ? (
            <PosterGrid>
              {library.data.movies.map(movie => (
                <PosterCard key={movie.id} movie={movie} />
              ))}
            </PosterGrid>
          ) : (
            <EmptyState className="min-h-0 flex-1 py-12" title="没有符合条件的影片" />
          )}
          <ListPagination
            page={page}
            totalPages={Math.max(1, Math.ceil(library.data.total / LIBRARY_PAGE_SIZE))}
            hasMore={library.data.has_more}
            disabled={library.isFetching}
            onPageChange={onPageChange}
          />
        </>
      )}
    </AppPage>
  )
}

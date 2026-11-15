import type { DiscoverMovie } from '@/api/discover'
import { EmptyState } from '@/components/empty-state'
import { ErrorState, InlineError } from '@/components/error-state'
import { ListPagination } from '@/components/list-pagination'
import { DISCOVER_PAGE_SIZE } from './constants'
import { DiscoverFeatureCard, DiscoverFeatureSkeleton } from './featured-card'
import { DiscoverGridSkeleton, MovieGrid } from './movie-grid'

export function DiscoverResults({
  movies,
  loading,
  fetching,
  error,
  searching,
  featured = false,
  page,
  onPageChange,
  onRetry
}: {
  movies: DiscoverMovie[] | undefined
  loading: boolean
  fetching: boolean
  error: boolean
  searching: boolean
  featured?: boolean
  page: number
  onPageChange: (page: number) => void
  onRetry: () => void
}) {
  if (error && !movies?.length) {
    return (
      <ErrorState
        message="数据加载失败，请检查网络或代理设置"
        onRetry={onRetry}
        retrying={fetching}
      />
    )
  }
  if (!movies) return <ResultsSkeleton featured={featured} />
  if (loading && movies.length === 0) return <ResultsSkeleton featured={featured} />
  const feature = featured && movies.length > 0 ? movies[0] : undefined
  const gridMovies = feature ? movies.slice(1) : movies
  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <InlineError onRetry={onRetry} retrying={fetching}>
          刷新失败，显示的是上次的内容
        </InlineError>
      ) : null}
      {movies.length === 0 && page === 1 ? (
        <EmptyState title={searching ? '没有搜索结果' : '暂无内容'} />
      ) : (
        <>
          {feature ? <DiscoverFeatureCard movie={feature} /> : null}
          {gridMovies.length > 0 ? <MovieGrid movies={gridMovies} /> : null}
          <ListPagination
            page={page}
            hasMore={movies.length === DISCOVER_PAGE_SIZE}
            disabled={fetching}
            onPageChange={onPageChange}
          />
        </>
      )}
    </div>
  )
}

function ResultsSkeleton({ featured }: { featured: boolean }) {
  return (
    <div className="flex flex-col gap-7" aria-busy="true">
      {featured ? <DiscoverFeatureSkeleton /> : null}
      <DiscoverGridSkeleton count={DISCOVER_PAGE_SIZE - (featured ? 1 : 0)} />
    </div>
  )
}

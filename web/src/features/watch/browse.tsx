import { type ReactNode, useEffect, useRef } from 'react'

import {
  WATCH_PAGE_SIZE,
  type LibraryFacetKind,
  type LibraryFilter,
  useLibraryMovies
} from '@/api/library'
import { AppPage } from '@/components/app-page'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { PageHeader } from '@/components/page-header'
import { LibraryFilters } from '@/features/library/filters'
import { PosterCard, PosterGrid, PosterSkeletons } from './poster-card'

// Start loading the next page this far before the end comes into view.
const preload = '1200px'

// The poster grid grows as it scrolls. `pages` is how many pages are shown;
// it lives in the address so going back lands on the same spot.
export function WatchBrowse({
  pages,
  filter,
  onPagesChange,
  onFilterChange,
  title,
  description,
  header,
  actions,
  locked
}: {
  pages: number
  filter: LibraryFilter
  onPagesChange: (pages: number) => void
  onFilterChange: (filter: LibraryFilter) => void
  title: string
  description: string
  header?: ReactNode
  actions?: ReactNode
  // Profile and collection pages keep their own filter.
  locked?: LibraryFacetKind
}) {
  const first = useLibraryMovies(1, filter, WATCH_PAGE_SIZE)
  const total = first.data?.total
  const last = Math.max(1, Math.ceil((total ?? 0) / WATCH_PAGE_SIZE))
  const shown = Math.min(pages, last)
  // The next page waits until the last one shown has arrived.
  const tail = useLibraryMovies(shown, filter, WATCH_PAGE_SIZE)
  const ready = !!tail.data && !tail.isPlaceholderData
  const end = useRef<HTMLDivElement>(null)

  // Observing anew after each page checks whether the end is still in reach.
  useEffect(() => {
    const element = end.current
    if (!element || !ready || shown >= last) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) onPagesChange(shown + 1)
      },
      { rootMargin: `0px 0px ${preload} 0px` }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ready, shown, last, onPagesChange])

  return (
    <AppPage>
      <PageHeader title={title} description={description}>
        {actions}
      </PageHeader>
      {header}
      <LibraryFilters filter={filter} locked={locked} total={total} onChange={onFilterChange} />
      {first.isError ? (
        <ErrorState
          message="无法读取片库，请检查后端服务后重试"
          onRetry={() => void first.refetch()}
          retrying={first.isFetching}
        />
      ) : first.data && first.data.movies.length === 0 ? (
        <EmptyState className="min-h-0 flex-1 py-12" title="没有符合条件的影片" />
      ) : (
        <PosterGrid>
          {Array.from({ length: shown }, (_, index) => (
            <PosterPage key={index + 1} page={index + 1} filter={filter} />
          ))}
        </PosterGrid>
      )}
      <div ref={end} />
      {first.data && shown >= last && last > 1 ? (
        <p className="py-6 text-center text-xs tracking-widest text-muted-foreground">
          共 {total} 部，到底了
        </p>
      ) : null}
    </AppPage>
  )
}

function PosterPage({ page, filter }: { page: number; filter: LibraryFilter }) {
  const result = useLibraryMovies(page, filter, WATCH_PAGE_SIZE)
  if (!result.data) return <PosterSkeletons count={WATCH_PAGE_SIZE} />
  return result.data.movies.map(movie => <PosterCard key={movie.id} movie={movie} />)
}

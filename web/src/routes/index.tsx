import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'

import type { LibraryFilter, LibrarySort } from '@/api/library'
import { AppPage } from '@/components/app-page'
import { ErrorState } from '@/components/error-state'
import { LibraryPage } from '@/features/library/page'
import { parseSearchPage } from '@/lib/search-schema'

type LibrarySearch = LibraryFilter & { page?: number }

const sorts: LibrarySort[] = ['added', 'release', 'code', 'rating']

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const result: LibrarySearch = {}
    const page = parseSearchPage(search.page)
    if (page) result.page = page
    if (typeof search.q === 'string' && search.q.trim()) result.q = search.q.trim().slice(0, 200)
    if (search.chinese === true || search.chinese === 'true') result.chinese = true
    if (sorts.includes(search.sort as LibrarySort) && search.sort !== 'added') {
      result.sort = search.sort as LibrarySort
    }
    return result
  },
  component: LibraryRoute,
  errorComponent: () => (
    <AppPage>
      <ErrorState message="媒体库页码无效" />
    </AppPage>
  )
})

function LibraryRoute() {
  const { page, ...filter } = Route.useSearch()
  const navigate = Route.useNavigate()
  const changeFilter = useCallback(
    (next: LibraryFilter) => void navigate({ search: next, resetScroll: false }),
    [navigate]
  )
  return (
    <LibraryPage
      page={page ?? 1}
      filter={filter}
      onPageChange={next =>
        void navigate({
          search: previous => ({ ...previous, page: next > 1 ? next : undefined }),
          resetScroll: false
        })
      }
      onFilterChange={changeFilter}
    />
  )
}

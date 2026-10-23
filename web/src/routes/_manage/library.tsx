import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'

import type { LibraryFilter } from '@/api/library'
import { AppPage } from '@/components/app-page'
import { ErrorState } from '@/components/error-state'
import { LibraryPage } from '@/features/library/page'
import { parseLibrarySearch } from '@/features/library/search'

export const Route = createFileRoute('/_manage/library')({
  validateSearch: parseLibrarySearch,
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

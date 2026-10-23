import { createFileRoute } from '@tanstack/react-router'

import type { LibraryFilter } from '@/api/library'
import { AppPage } from '@/components/app-page'
import { ErrorState } from '@/components/error-state'
import { parseLibrarySearch } from '@/features/library/search'
import { WatchBrowse } from '@/features/watch/browse'

export const Route = createFileRoute('/_watch/browse')({
  validateSearch: parseLibrarySearch,
  component: BrowseRoute,
  errorComponent: () => (
    <AppPage>
      <ErrorState message="片库页码无效" />
    </AppPage>
  )
})

function BrowseRoute() {
  const { page, ...filter } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <WatchBrowse
      page={page ?? 1}
      filter={filter}
      title="片库"
      description="按演员、厂牌、系列、标签和年份挑片"
      onPageChange={next =>
        void navigate({
          search: previous => ({ ...previous, page: next > 1 ? next : undefined }),
          resetScroll: false
        })
      }
      onFilterChange={(next: LibraryFilter) => void navigate({ search: next, resetScroll: false })}
    />
  )
}

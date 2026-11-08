import { createFileRoute } from '@tanstack/react-router'

import type { LibraryFilter } from '@/api/library'
import { AppPage } from '@/components/app-page'
import { ErrorState } from '@/components/error-state'
import { PageHeader } from '@/components/page-header'
import { type LibrarySearch, parseLibrarySearch } from '@/features/library/search'
import { SearchResults } from '@/features/search/page'
import { type ProfileSource, SourceTabs } from '@/features/watch/actor-catalogue'
import { WatchBrowse } from '@/features/watch/browse'

export const Route = createFileRoute('/_app/browse')({
  // A keyword can also be searched on JavDB, for movies not in the library.
  validateSearch: (search: Record<string, unknown>): LibrarySearch & { source?: ProfileSource } => {
    const parsed = parseLibrarySearch(search)
    return parsed.q && search.source === 'javdb' ? { ...parsed, source: 'javdb' } : parsed
  },
  component: BrowseRoute,
  errorComponent: () => (
    <AppPage>
      <ErrorState message="片库页码无效" />
    </AppPage>
  )
})

function BrowseRoute() {
  const { page, source, ...filter } = Route.useSearch()
  const navigate = Route.useNavigate()
  const setPage = (next: number) =>
    void navigate({
      search: previous => ({ ...previous, page: next > 1 ? next : undefined }),
      resetScroll: false
    })
  const tabs = filter.q ? <SourceTabs source={source ?? 'library'} query={filter.q} /> : null
  if (source === 'javdb' && filter.q) {
    return (
      <AppPage>
        <PageHeader
          title={`搜索「${filter.q}」`}
          description="JavDB 上的所有影片，没入库的可以直接离线"
        >
          {tabs}
        </PageHeader>
        <SearchResults key={filter.q} keyword={filter.q} page={page ?? 1} onPageChange={setPage} />
      </AppPage>
    )
  }
  return (
    <WatchBrowse
      page={page ?? 1}
      filter={filter}
      title={filter.q ? `搜索「${filter.q}」` : '片库'}
      description={
        filter.q
          ? '片库里的结果；没入库的片子切到 JavDB 查找'
          : '按演员、厂牌、系列、标签和年份挑片'
      }
      actions={tabs}
      onPageChange={setPage}
      onFilterChange={(next: LibraryFilter) => void navigate({ search: next, resetScroll: false })}
    />
  )
}

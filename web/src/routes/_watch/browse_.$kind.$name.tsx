import { createFileRoute, notFound } from '@tanstack/react-router'

import type { LibraryFacetKind, LibraryFilter } from '@/api/library'
import { AppPage } from '@/components/app-page'
import { ErrorState } from '@/components/error-state'
import { facetLabels } from '@/features/library/facet-filters'
import { ProfileHeader } from '@/features/library/profile-header'
import { parseLibrarySearch } from '@/features/library/search'
import { WatchBrowse } from '@/features/watch/browse'

const kinds: LibraryFacetKind[] = ['actor', 'maker', 'series', 'tag']

export const Route = createFileRoute('/_watch/browse_/$kind/$name')({
  validateSearch: parseLibrarySearch,
  beforeLoad: ({ params }) => {
    if (!kinds.includes(params.kind as LibraryFacetKind)) throw notFound()
  },
  component: ProfileRoute,
  errorComponent: () => (
    <AppPage>
      <ErrorState message="资料页地址无效" />
    </AppPage>
  )
})

function ProfileRoute() {
  const { kind: raw, name } = Route.useParams()
  const kind = raw as LibraryFacetKind
  const { page, ...filter } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <WatchBrowse
      key={`${kind}:${name}`}
      page={page ?? 1}
      filter={{ ...filter, [kind]: name }}
      title={name}
      description={`${facetLabels[kind]}资料页`}
      header={<ProfileHeader kind={kind} name={name} />}
      locked={kind}
      onPageChange={next =>
        void navigate({
          search: previous => ({ ...previous, page: next > 1 ? next : undefined }),
          resetScroll: false
        })
      }
      onFilterChange={(next: LibraryFilter) => {
        const { [kind]: _, ...rest } = next
        void navigate({ search: rest, resetScroll: false })
      }}
    />
  )
}

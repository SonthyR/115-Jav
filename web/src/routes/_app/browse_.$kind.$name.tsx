import { createFileRoute, notFound } from '@tanstack/react-router'

import {
  findFacet,
  type LibraryFacetKind,
  type LibraryFilter,
  useLibraryFacets
} from '@/api/library'
import { AppPage } from '@/components/app-page'
import { ErrorState } from '@/components/error-state'
import { facetLabels } from '@/features/library/facet-filters'
import { ProfileHeader } from '@/features/library/profile-header'
import { type LibrarySearch, parseLibrarySearch } from '@/features/library/search'
import {
  ActorCatalogue,
  ProfileActions,
  type ProfileSource
} from '@/features/watch/actor-catalogue'
import { WatchBrowse } from '@/features/watch/browse'

const kinds: LibraryFacetKind[] = ['actor', 'maker', 'series', 'tag']

export const Route = createFileRoute('/_app/browse_/$kind/$name')({
  validateSearch: (search: Record<string, unknown>): LibrarySearch & { source?: ProfileSource } =>
    search.source === 'javdb'
      ? { ...parseLibrarySearch(search), source: 'javdb' }
      : parseLibrarySearch(search),
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
  const { page, source, ...filter } = Route.useSearch()
  const navigate = Route.useNavigate()
  const facets = useLibraryFacets()
  const javdbID = kind === 'actor' ? findFacet(facets.data?.actors, name)?.javdb_id : undefined
  const header = <ProfileHeader kind={kind} name={name} />
  const actions = javdbID ? (
    <ProfileActions name={name} javdbID={javdbID} source={source ?? 'library'} />
  ) : null
  if (source === 'javdb' && javdbID) {
    return (
      <ActorCatalogue
        key={javdbID}
        name={name}
        javdbID={javdbID}
        page={page ?? 1}
        header={header}
        actions={actions}
        onPageChange={next =>
          void navigate({
            search: previous => ({ ...previous, page: next > 1 ? next : undefined }),
            resetScroll: false
          })
        }
      />
    )
  }
  return (
    <WatchBrowse
      key={`${kind}:${name}`}
      pages={page ?? 1}
      filter={{ ...filter, [kind]: name }}
      title={name}
      description={`${facetLabels[kind]}资料页`}
      header={header}
      actions={actions}
      locked={kind}
      onPagesChange={next =>
        void navigate({
          search: previous => ({ ...previous, page: next }),
          replace: true,
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

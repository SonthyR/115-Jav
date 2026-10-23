import { createFileRoute, notFound } from '@tanstack/react-router'

import { AppPage } from '@/components/app-page'
import { ErrorState } from '@/components/error-state'
import { CollectionDetail } from '@/features/collections/detail'
import { parseLibrarySearch } from '@/features/library/search'

export const Route = createFileRoute('/_watch/collections_/$id')({
  validateSearch: parseLibrarySearch,
  beforeLoad: ({ params }) => {
    if (!/^[1-9]\d*$/.test(params.id)) throw notFound()
  },
  component: CollectionRoute,
  errorComponent: () => (
    <AppPage>
      <ErrorState message="收藏夹地址无效" />
    </AppPage>
  )
})

function CollectionRoute() {
  const { id } = Route.useParams()
  return <CollectionDetail key={id} id={Number(id)} search={Route.useSearch()} />
}

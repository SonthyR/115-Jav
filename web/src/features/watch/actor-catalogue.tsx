import { type ReactNode, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { useDiscoverMovies, useDiscoverTags } from '@/api/discover'
import { AppPage } from '@/components/app-page'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CommonFilterSelect } from '@/features/discover/common-filter-select'
import { DISCOVER_PAGE_SIZE } from '@/features/discover/constants'
import { ActorSubscribeButton } from '@/features/discover/metadata-search-page'
import { DiscoverResults } from '@/features/discover/results'

export type ProfileSource = 'library' | 'javdb'

// The actor's works on JavDB, newest first, so new releases can be sent to
// offline download or subscribed to without leaving the watch pages.
export function ActorCatalogue({
  name,
  javdbID,
  page,
  header,
  actions,
  onPageChange
}: {
  name: string
  javdbID: string
  page: number
  header: ReactNode
  actions: ReactNode
  onPageChange: (page: number) => void
}) {
  const [main, setMain] = useState('')
  const taxonomy = useDiscoverTags('censored')
  const mainOptions = taxonomy.data?.find(category => category.id === 'main')?.tags ?? []
  const movies = useDiscoverMovies({
    entityType: 'actor',
    entityID: javdbID,
    sort: 'release',
    order: 'desc',
    page,
    limit: DISCOVER_PAGE_SIZE,
    ...(main ? { main: [main] } : {})
  })
  return (
    <AppPage>
      <PageHeader title={name} description="演员在 JavDB 上的作品，按发行日期从新到旧">
        {actions}
        {mainOptions.length > 0 ? (
          <CommonFilterSelect
            options={mainOptions}
            value={main}
            onValueChange={value => {
              setMain(value)
              onPageChange(1)
            }}
          />
        ) : null}
      </PageHeader>
      {header}
      <DiscoverResults
        movies={movies.data}
        loading={movies.isPending}
        fetching={movies.isFetching}
        error={movies.isError}
        searching={false}
        page={page}
        onPageChange={onPageChange}
        onRetry={() => void movies.refetch()}
      />
    </AppPage>
  )
}

// SourceTabs switches a page between the library and JavDB.
export function SourceTabs({
  source,
  query
}: {
  source: ProfileSource
  // query keeps a search keyword on both sides.
  query?: string
}) {
  const keep = query ? { q: query } : {}
  return (
    <Tabs value={source}>
      <TabsList>
        <TabsTrigger value="library" asChild>
          <Link to="." search={keep} resetScroll={false}>
            片库
          </Link>
        </TabsTrigger>
        <TabsTrigger value="javdb" asChild>
          <Link to="." search={{ ...keep, source: 'javdb' }} resetScroll={false}>
            JavDB
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

// ProfileActions switches an actor page between the library and JavDB, and
// subscribes to the actor's new releases.
export function ProfileActions({
  name,
  javdbID,
  source
}: {
  name: string
  javdbID: string
  source: ProfileSource
}) {
  return (
    <>
      <SourceTabs source={source} />
      <ActorSubscribeButton actorID={javdbID} actorName={name} />
    </>
  )
}

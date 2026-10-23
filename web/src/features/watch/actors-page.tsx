import { SearchIcon } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { useLibraryFacets } from '@/api/library'
import { AppPage } from '@/components/app-page'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from 'cn'
import { ActorTile } from './actor-tile'

// Portraits are many; they render a batch at a time as the list is extended.
const batch = 120

type Sort = 'count' | 'name'

export function ActorsPage() {
  const facets = useLibraryFacets()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('count')
  const [withAvatar, setWithAvatar] = useState(false)
  const [shown, setShown] = useState(batch)
  const deferred = useDeferredValue(query.trim().toLowerCase())

  const actors = (facets.data?.actors ?? [])
    .filter(actor => !deferred || actor.name.toLowerCase().includes(deferred))
    .filter(actor => !withAvatar || actor.avatar)
  const sorted =
    sort === 'name' ? actors.toSorted((a, b) => a.name.localeCompare(b.name, 'ja')) : actors

  return (
    <AppPage>
      <PageHeader
        title="演员"
        description={
          facets.data ? `媒体库里共 ${facets.data.actors.length} 位演员` : '媒体库里的演员'
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder="搜索演员"
            className="pl-9"
            onChange={event => {
              setQuery(event.target.value)
              setShown(batch)
            }}
          />
        </div>
        <Toggle active={sort === 'count'} onClick={() => setSort('count')}>
          按作品数
        </Toggle>
        <Toggle active={sort === 'name'} onClick={() => setSort('name')}>
          按名字
        </Toggle>
        <Toggle active={withAvatar} onClick={() => setWithAvatar(value => !value)}>
          只看有头像
        </Toggle>
      </div>

      {facets.isPending ? (
        <p className="text-sm text-muted-foreground">正在读取演员…</p>
      ) : facets.isError ? (
        <ErrorState
          message="演员列表加载失败"
          onRetry={() => void facets.refetch()}
          retrying={facets.isFetching}
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          className="py-12"
          title={deferred ? '没有找到这位演员' : '媒体库里还没有演员'}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
            {sorted.slice(0, shown).map(actor => (
              <ActorTile key={actor.name} actor={actor} />
            ))}
          </div>
          {sorted.length > shown ? (
            <Button
              variant="outline"
              className="self-center"
              onClick={() => setShown(value => value + batch)}
            >
              显示更多（还有 {sorted.length - shown} 位）
            </Button>
          ) : null}
        </>
      )}
    </AppPage>
  )
}

function Toggle({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      className={cn('rounded-full')}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

import { Link } from '@tanstack/react-router'
import { FolderHeartIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { describeApiError } from '@/api/client'
import { useCollections, useCreateCollection } from '@/api/collections'
import { AppPage } from '@/components/app-page'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { MovieCover } from '@/components/movie/movie-cover'
import { MovieGridLayout } from '@/components/movie/movie-grid-layout'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function CollectionsPage() {
  const collections = useCollections()
  const create = useCreateCollection()
  const [name, setName] = useState('')

  const submit = () => {
    if (!name.trim()) return
    create.mutate(name, {
      onSuccess: () => setName(''),
      onError: error => toast.error(describeApiError(error))
    })
  }

  return (
    <AppPage>
      <PageHeader title="收藏夹" description="自己整理的片单，也可以按顺序连着播" />
      <form
        className="flex max-w-md gap-2"
        onSubmit={event => {
          event.preventDefault()
          submit()
        }}
      >
        <Input
          value={name}
          maxLength={100}
          placeholder="新收藏夹名称"
          onChange={event => setName(event.target.value)}
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          <PlusIcon data-icon="inline-start" />
          新建
        </Button>
      </form>
      {collections.isError ? (
        <ErrorState
          message="收藏夹加载失败"
          onRetry={() => void collections.refetch()}
          retrying={collections.isFetching}
        />
      ) : collections.data?.length === 0 ? (
        <EmptyState className="py-12" title="还没有收藏夹，在影片详情里点「收藏」也能新建" />
      ) : (
        <MovieGridLayout>
          {collections.data?.map(item => (
            <Link
              key={item.id}
              to="/collections/$id"
              params={{ id: String(item.id) }}
              className="rounded-2xl outline-ring"
            >
              <Card size="sm" className="h-full gap-0 overflow-hidden py-0">
                <div className="relative flex aspect-3/2 items-center justify-center bg-muted">
                  {item.cover ? (
                    <div className="absolute inset-0">
                      <MovieCover source={item.cover} />
                    </div>
                  ) : (
                    <FolderHeartIcon className="size-10 text-muted-foreground" />
                  )}
                </div>
                <CardContent className="space-y-1 p-3">
                  <h3 className="truncate text-sm font-semibold">{item.name}</h3>
                  <p className="text-xs text-muted-foreground">{item.count} 部</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </MovieGridLayout>
      )}
    </AppPage>
  )
}

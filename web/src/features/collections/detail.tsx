import { useNavigate } from '@tanstack/react-router'
import { PencilIcon, PlayIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { apiGet, describeApiError } from '@/api/client'
import { useCollections, useDeleteCollection, useRenameCollection } from '@/api/collections'
import type { LibraryFilter, LibraryMovie } from '@/api/library'
import { Button } from '@/components/ui/button'
import { WatchBrowse } from '@/features/watch/browse'
import type { LibrarySearch } from '@/features/library/search'
import { usePlaylist } from '@/features/player/playlist'

export function CollectionDetail({ id, search }: { id: number; search: LibrarySearch }) {
  const navigate = useNavigate()
  const collections = useCollections()
  const rename = useRenameCollection()
  const remove = useDeleteCollection()
  const startPlaylist = usePlaylist(state => state.start)
  const collection = collections.data?.find(item => item.id === id)
  const { page, ...filter } = search

  const playAll = async () => {
    try {
      // The whole collection plays in the order shown, one movie after another.
      const result = await apiGet<{ movies: LibraryMovie[] }>('/api/library/movies', {
        collection: id,
        sort: filter.sort,
        limit: 100
      })
      const ids = result.movies.map(movie => movie.id)
      if (ids.length === 0) return
      startPlaylist(ids)
      void navigate({ to: '/play/$id', params: { id: String(ids[0]) }, search: { list: true } })
    } catch (error) {
      toast.error(describeApiError(error))
    }
  }

  return (
    <WatchBrowse
      page={page ?? 1}
      filter={{ ...filter, collection: id }}
      title={collection?.name ?? '收藏夹'}
      description={collection ? `${collection.count} 部影片` : '收藏夹'}
      header={
        <div className="flex flex-wrap gap-2">
          <Button disabled={!collection?.count} onClick={() => void playAll()}>
            <PlayIcon data-icon="inline-start" />
            顺序播放
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const name = window.prompt('收藏夹名称', collection?.name)?.trim()
              if (name)
                rename.mutate(
                  { id, name },
                  { onError: error => toast.error(describeApiError(error)) }
                )
            }}
          >
            <PencilIcon data-icon="inline-start" />
            重命名
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!window.confirm(`删除收藏夹「${collection?.name ?? ''}」？影片本身不会删除。`))
                return
              remove.mutate(id, {
                onSuccess: () => void navigate({ to: '/collections' }),
                onError: error => toast.error(describeApiError(error))
              })
            }}
          >
            <Trash2Icon data-icon="inline-start" />
            删除
          </Button>
        </div>
      }
      onPageChange={next =>
        void navigate({
          to: '/collections/$id',
          params: { id: String(id) },
          search: { ...search, page: next > 1 ? next : undefined },
          resetScroll: false
        })
      }
      onFilterChange={(next: LibraryFilter) => {
        const { collection: _, ...rest } = next
        void navigate({
          to: '/collections/$id',
          params: { id: String(id) },
          search: rest,
          resetScroll: false
        })
      }}
    />
  )
}

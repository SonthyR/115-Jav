import { Link } from '@tanstack/react-router'
import { LayoutGridIcon, ListIcon, LoaderCircleIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useLite } from '@/api/auth'
import { useCollections, useToggleCollection } from '@/api/collections'
import {
  LIBRARY_PAGE_SIZE,
  type LibraryFilter,
  type LibraryMovie,
  useLibraryMovies
} from '@/api/library'
import { useAddOffline } from '@/api/offline'
import { isScanTask, isTaskActive, useRetryTask, useTasks } from '@/api/tasks'
import { AppPage } from '@/components/app-page'
import { EmptyState } from '@/components/empty-state'
import { ErrorState, InlineError } from '@/components/error-state'
import { ListPagination } from '@/components/list-pagination'
import { MovieGridLayout } from '@/components/movie/movie-grid-layout'
import { MovieGridSkeleton } from '@/components/movie/movie-grid-skeleton'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LibraryFilters } from '@/features/library/filters'
import { LibraryTable, LibraryTableSkeleton } from '@/features/library/library-table'
import { LibraryMovieCard } from '@/features/library/movie-card'
import { LibraryScanButton } from '@/features/library/scan-button'
import { ScanProgressView } from '@/features/tasks/scan-progress'
import { useTaskConnection } from '@/features/tasks/task-events'
import { sameSource } from '@/lib/source'
import { cn } from 'cn'

type LibraryView = 'grid' | 'table'
type BulkAction = 'offline' | 'collection'

type BulkBatch = {
  id: number
  movies: LibraryMovie[]
  action: BulkAction
  collectionID?: number
}

type BulkStats = {
  id: number
  action: BulkAction
  collectionName?: string
  remaining: number
  succeeded: number
  failed: number
}

const noSelection = new Set<number>()

export function LibraryPage({
  page,
  filter = {},
  onPageChange,
  onFilterChange
}: {
  page: number
  filter?: LibraryFilter
  onPageChange: (page: number) => void
  onFilterChange?: (filter: LibraryFilter) => void
}) {
  const library = useLibraryMovies(page, filter)
  const lite = useLite()
  const { sort: _, ...narrowing } = filter
  const filtered = Object.values(narrowing).some(value => value !== undefined)
  const tasks = useTasks()
  const connection = useTaskConnection()
  const retry = useRetryTask()
  const [view, setView] = useState<LibraryView>('grid')
  const filterKey = JSON.stringify(filter)
  const selectionKey = `${page}:${filterKey}`
  const [selection, setSelection] = useState<{ key: string; ids: Set<number> }>(() => ({
    key: selectionKey,
    ids: new Set()
  }))
  const [batch, setBatch] = useState<BulkBatch>()
  const bulkStats = useRef<BulkStats | undefined>(undefined)
  const selected = selection.key === selectionKey ? selection.ids : noSelection
  const source = library.data?.source
  const hasPageData = !!library.data && !library.isPlaceholderData
  const sourceTasks = tasks.data?.filter(isScanTask).filter(task => sameSource(task.source, source))
  const latest = sourceTasks?.find(task => !task.movie_id && !task.offline_task_id)
  const scanning = latest !== undefined && isTaskActive(latest)
  const failed = !scanning && latest?.status === 'failed'
  const failedEmpty = failed && !filtered
  const processingMovies = new Set(sourceTasks?.filter(isTaskActive).map(task => task.movie_id))
  const selectedMovies = (library.data?.movies ?? []).filter(movie => selected.has(movie.id))
  const actionBusy = !source || scanning || !!batch
  const bulkDisabled =
    !source || scanning || !!batch || selectedMovies.some(movie => processingMovies.has(movie.id))
  const emptyTitle = !source
    ? '登录 115 并挂载媒体目录后，将自动同步入库'
    : filtered
      ? '没有符合条件的影片'
      : scanning
        ? connection.status === 'connected'
          ? `${latest?.rebuild ? '正在重建' : '正在同步'}，识别到的影片会陆续显示`
          : connection.status === 'connecting'
            ? '正在连接任务进度，识别到的影片会陆续显示'
            : '进度已断开，等待重新连接'
        : failedEmpty
          ? latest?.error || '上次同步失败，请重试'
          : '未识别到影片'
  const count = library.data?.total
  const subtitle =
    count === undefined
      ? '正在读取片库 · 来自 115 网盘'
      : `${count} 部影片 · 来自 115 网盘${selectedMovies.length > 0 ? ` · 已选 ${selectedMovies.length} 部` : ''}`

  function selectMovie(id: number, next: boolean) {
    setSelection(current => {
      const value = new Set(current.key === selectionKey ? current.ids : noSelection)
      if (next) value.add(id)
      else value.delete(id)
      return { key: selectionKey, ids: value }
    })
  }

  function selectPage(next: boolean) {
    setSelection({
      key: selectionKey,
      ids: next ? new Set(library.data?.movies.map(movie => movie.id)) : new Set()
    })
  }

  function clearSelection() {
    setSelection({ key: selectionKey, ids: new Set() })
  }

  function addSelectedToOffline() {
    if (selectedMovies.length === 0 || bulkDisabled) return
    const movies = selectedMovies.filter(movie => !!movie.javdb_id)
    const missing = selectedMovies.length - movies.length
    if (movies.length === 0) {
      toast.warning('未加入下载', { description: '所选影片缺少 JavDB 编号。' })
      clearSelection()
      return
    }
    startBulk(movies, missing, 'offline')
  }

  function addSelectedToCollection(collectionID: number, collectionName: string) {
    if (selectedMovies.length === 0 || bulkDisabled) return
    startBulk(selectedMovies, 0, 'collection', collectionName, collectionID)
  }

  function startBulk(
    movies: LibraryMovie[],
    failed: number,
    action: BulkAction,
    collectionName?: string,
    collectionID?: number
  ) {
    const id = Date.now()
    bulkStats.current = {
      id,
      action,
      collectionName,
      remaining: movies.length,
      succeeded: 0,
      failed
    }
    setBatch({
      id,
      movies,
      action,
      collectionID
    })
  }

  function settleBulkMovie(batchID: number, succeeded: boolean) {
    const stats = bulkStats.current
    if (!stats || stats.id !== batchID) return
    stats.remaining = Math.max(0, stats.remaining - 1)
    stats.succeeded += succeeded ? 1 : 0
    stats.failed += succeeded ? 0 : 1
    if (stats.remaining > 0) return

    bulkStats.current = undefined
    setBatch(undefined)
    clearSelection()
    const offline = stats.action === 'offline'
    const description = `${stats.succeeded} 部${offline ? '已提交' : '已加入'}${
      stats.failed > 0 ? `，${stats.failed} 部未完成` : ''
    }`
    if (stats.succeeded > 0 && stats.failed === 0) {
      toast.success(offline ? '已加入 115 下载' : `已加入收藏夹「${stats.collectionName ?? ''}」`, {
        description
      })
    } else if (stats.succeeded > 0) {
      toast.warning(`部分影片未加入${offline ? '下载' : '收藏夹'}`, { description })
    } else {
      toast.warning(`未能加入${offline ? '下载' : '收藏夹'}`, { description })
    }
  }

  return (
    <AppPage>
      <PageHeader title="媒体库" description={subtitle}>
        <LibraryScanButton
          loading={library.isPending}
          available={!!source}
          scanning={scanning}
          rebuilding={!!latest?.rebuild}
          connected={connection.status === 'connected'}
          onStarted={() => onPageChange(1)}
        />
        {library.isSuccess && !source ? (
          <Button asChild>
            <Link to="/settings">挂载媒体目录</Link>
          </Button>
        ) : null}
        <div
          role="group"
          aria-label="视图"
          className="flex items-center gap-0.5 rounded-[9px] border border-border bg-card/60 p-0.5"
        >
          {(
            [
              ['grid', LayoutGridIcon, '网格视图'],
              ['table', ListIcon, '表格视图']
            ] as const
          ).map(([value, Icon, label]) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                'size-9 rounded-[7px] text-muted-foreground sm:size-8',
                view === value && 'bg-secondary text-foreground hover:bg-secondary'
              )}
            >
              <Icon strokeWidth={1.6} />
            </Button>
          ))}
        </div>
      </PageHeader>

      {scanning && latest ? (
        <div className="flex min-w-0 rounded-[9px] border border-border bg-card/60 px-4 py-3">
          <ScanProgressView task={latest} />
        </div>
      ) : null}

      {onFilterChange && source ? (
        <LibraryFilters filter={filter} total={library.data?.total} onChange={onFilterChange} />
      ) : null}

      {tasks.isError ? (
        <InlineError
          onRetry={connection.reconnect}
          retrying={connection.status === 'connecting'}
          retryLabel="重新连接"
        >
          暂时无法获取任务状态，请检查后端服务后重试。
        </InlineError>
      ) : null}

      {library.isPending ? (
        view === 'table' ? (
          <LibraryTableSkeleton count={LIBRARY_PAGE_SIZE} />
        ) : (
          <MovieGridSkeleton count={LIBRARY_PAGE_SIZE} compact poster />
        )
      ) : library.isError && !hasPageData ? (
        <ErrorState
          message="无法读取媒体库，请检查后端服务后重试"
          onRetry={() => void library.refetch()}
          retrying={library.isFetching}
        />
      ) : (
        <>
          {library.isError ? (
            <InlineError onRetry={() => void library.refetch()} retrying={library.isFetching}>
              刷新失败，显示的是上次的内容
            </InlineError>
          ) : null}
          {library.data.movies.length > 0 ? (
            view === 'table' ? (
              <LibraryTable
                movies={library.data.movies}
                busy={actionBusy}
                selected={selected}
                selectionDisabled={!!batch}
                onSelect={selectMovie}
                onSelectAll={selectPage}
              />
            ) : (
              <MovieGridLayout>
                {library.data.movies.map(movie => (
                  <LibraryMovieCard
                    key={movie.id}
                    movie={movie}
                    lite={lite}
                    busy={actionBusy || processingMovies.has(movie.id)}
                    selected={selected.has(movie.id)}
                    selectionDisabled={!!batch}
                    onSelect={selectMovie}
                  />
                ))}
              </MovieGridLayout>
            )
          ) : (
            <EmptyState
              className="min-h-0 flex-1 py-12"
              title={emptyTitle}
              actions={
                failedEmpty && latest !== undefined && latest.id != null ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(latest.id)}
                  >
                    重试同步
                  </Button>
                ) : failedEmpty ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/settings">查看任务</Link>
                  </Button>
                ) : undefined
              }
            />
          )}
          <ListPagination
            page={page}
            totalPages={Math.max(1, Math.ceil(library.data.total / LIBRARY_PAGE_SIZE))}
            hasMore={library.data.has_more}
            disabled={library.isFetching}
            onPageChange={onPageChange}
          />
          {selectedMovies.length > 0 ? <div aria-hidden="true" className="h-14 md:h-10" /> : null}
        </>
      )}

      {selectedMovies.length > 0 ? (
        <div
          aria-live="polite"
          className="fixed bottom-[calc(74px+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-2.5rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-foreground py-2 pr-2 pl-4 text-background shadow-[0_14px_40px_rgba(0,0,0,0.24)] md:bottom-6"
        >
          <span className="shrink-0 text-xs tracking-wide tabular-nums">
            已选 {selectedMovies.length} 部
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={bulkDisabled}
            onClick={addSelectedToOffline}
            className="h-9 border border-background/25 px-3 text-xs text-background hover:bg-background/10 hover:text-background sm:h-8"
          >
            {batch ? <LoaderCircleIcon className="animate-spin" /> : null}
            {batch ? '加入中' : '加入下载'}
          </Button>
          <BulkCollectionPicker disabled={bulkDisabled} onSelect={addSelectedToCollection} />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!!batch}
            onClick={clearSelection}
            className="h-9 px-3 text-xs sm:h-8"
          >
            取消
          </Button>
        </div>
      ) : null}

      {batch?.movies.map(movie =>
        batch.action === 'offline' ? (
          <BulkOfflineMovie
            key={`${batch.id}:${movie.id}`}
            movie={movie}
            onSettled={succeeded => settleBulkMovie(batch.id, succeeded)}
          />
        ) : (
          <BulkCollectionMovie
            key={`${batch.id}:${movie.id}`}
            movie={movie}
            collectionID={batch.collectionID ?? 0}
            onSettled={succeeded => settleBulkMovie(batch.id, succeeded)}
          />
        )
      )}
    </AppPage>
  )
}

function BulkOfflineMovie({
  movie,
  onSettled
}: {
  movie: LibraryMovie
  onSettled: (succeeded: boolean) => void
}) {
  const add = useAddOffline(movie.javdb_id ?? '')
  const mutate = useRef(add.mutate)
  const settled = useRef(onSettled)
  const started = useRef(false)

  useEffect(() => {
    mutate.current = add.mutate
    settled.current = onSettled
  }, [add.mutate, onSettled])

  useEffect(() => {
    if (started.current || !movie.javdb_id) return
    started.current = true
    mutate.current(undefined, {
      onSuccess: () => settled.current(true),
      onError: () => settled.current(false)
    })
  }, [movie.javdb_id])

  return null
}

function BulkCollectionMovie({
  movie,
  collectionID,
  onSettled
}: {
  movie: LibraryMovie
  collectionID: number
  onSettled: (succeeded: boolean) => void
}) {
  const toggle = useToggleCollection(movie.id)
  const mutate = useRef(toggle.mutate)
  const settled = useRef(onSettled)
  const started = useRef(false)

  useEffect(() => {
    mutate.current = toggle.mutate
    settled.current = onSettled
  }, [toggle.mutate, onSettled])

  useEffect(() => {
    if (started.current || collectionID <= 0) return
    started.current = true
    mutate.current(
      { id: collectionID, member: true },
      {
        onSuccess: () => settled.current(true),
        onError: () => settled.current(false)
      }
    )
  }, [collectionID])

  return null
}

function BulkCollectionPicker({
  disabled,
  onSelect
}: {
  disabled: boolean
  onSelect: (id: number, name: string) => void
}) {
  const collections = useCollections()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-9 border border-background/25 px-3 text-xs text-background hover:bg-background/10 hover:text-background sm:h-8"
        >
          收藏
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-56 space-y-1 p-2">
        <p className="px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
          加入收藏夹
        </p>
        {collections.isPending ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">加载中…</p>
        ) : collections.isError ? (
          <div className="flex items-center justify-between gap-2 px-2 py-2 text-sm text-muted-foreground">
            <span>无法读取收藏夹</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={collections.isFetching}
              onClick={() => void collections.refetch()}
            >
              重试
            </Button>
          </div>
        ) : collections.data.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">还没有收藏夹</p>
        ) : (
          collections.data.map(collection => (
            <button
              key={collection.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gold/10 hover:text-gold"
              onClick={() => {
                setOpen(false)
                onSelect(collection.id, collection.name)
              }}
            >
              <span className="min-w-0 flex-1 truncate">{collection.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {collection.count}
              </span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  )
}

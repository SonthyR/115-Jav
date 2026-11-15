import { Checkbox } from '@/components/ui/checkbox'
import { MediaImage } from '@/components/media-image'
import { Skeleton } from '@/components/ui/skeleton'
import { MovieDetailTrigger } from '@/features/movie-detail/detail-trigger'
import { cn } from 'cn'
import type { LibraryMovie } from '@/api/library'
import { LibraryMovieActions } from './movie-actions'
import { LibraryMovieStatus } from './movie-status'

const rowColumns =
  'grid grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_5.5rem_2rem] items-center gap-2 sm:grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_4rem_4rem_7rem_2.5rem] sm:gap-3'

export function LibraryTable({
  movies,
  busy = false,
  selected,
  selectionDisabled = false,
  onSelect,
  onSelectAll
}: {
  movies: LibraryMovie[]
  busy?: boolean
  selected: ReadonlySet<number>
  selectionDisabled?: boolean
  onSelect: (id: number, selected: boolean) => void
  onSelectAll: (selected: boolean) => void
}) {
  const selectedCount = movies.filter(movie => selected.has(movie.id)).length
  const allSelected = movies.length > 0 && selectedCount === movies.length

  return (
    <div className="min-w-0 border-y border-border">
      <div
        className={cn(
          rowColumns,
          'min-h-10 border-b border-border py-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase'
        )}
      >
        <Checkbox
          aria-label={allSelected ? '取消选择当前页' : '选择当前页'}
          checked={allSelected ? true : selectedCount > 0 ? 'indeterminate' : false}
          disabled={selectionDisabled || movies.length === 0}
          onCheckedChange={value => onSelectAll(value === true)}
          className="size-4 border-foreground/30 bg-transparent"
        />
        <span aria-hidden="true" />
        <span>影片</span>
        <span className="hidden sm:block">年份</span>
        <span className="hidden sm:block">评分</span>
        <span>状态</span>
        <span aria-hidden="true" />
      </div>

      {movies.map(movie => {
        const title = movie.title || movie.code
        const year = movie.release_date?.slice(0, 4)
        const poster = movie.poster ?? movie.cover
        return (
          <div
            key={movie.id}
            className={cn(
              rowColumns,
              'min-h-[70px] border-b border-border py-2 text-xs last:border-b-0 hover:bg-card/50'
            )}
          >
            <Checkbox
              aria-label={`选择 ${movie.code}`}
              checked={selected.has(movie.id)}
              disabled={selectionDisabled}
              onCheckedChange={value => onSelect(movie.id, value === true)}
              className="size-4 border-foreground/30 bg-transparent"
            />
            <MovieDetailTrigger
              movie={{ libraryId: movie.id }}
              aria-label={`查看 ${title}`}
              className="relative aspect-2/3 w-9 overflow-hidden rounded-[4px] bg-muted outline-ring"
            >
              <MediaImage
                source={poster ?? ''}
                width={360}
                alt=""
                blurredBackground={!movie.poster}
                className={movie.poster ? 'object-cover' : 'object-contain'}
              />
            </MovieDetailTrigger>
            <MovieDetailTrigger
              movie={{ libraryId: movie.id }}
              aria-label={`查看 ${title}`}
              className="min-w-0 rounded-sm py-1 outline-ring"
            >
              <p className="truncate text-sm font-medium text-foreground">{title}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] tracking-[0.04em] text-muted-foreground tabular-nums">
                {movie.code}
              </p>
            </MovieDetailTrigger>
            <span className="hidden font-mono text-[11px] text-muted-foreground tabular-nums sm:block">
              {year ?? '—'}
            </span>
            <span className="hidden font-mono text-[11px] text-foreground/80 tabular-nums sm:block">
              {movie.rating > 0 ? `★ ${movie.rating.toFixed(1)}` : '—'}
            </span>
            <LibraryMovieStatus movie={movie} />
            <LibraryMovieActions movie={movie} disabled={busy} />
          </div>
        )
      })}
    </div>
  )
}

export function LibraryTableSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="min-w-0 border-y border-border" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={cn(rowColumns, 'min-h-[70px] border-b border-border py-2 last:border-b-0')}
        >
          <Skeleton className="size-4 rounded-[5px]" />
          <Skeleton className="aspect-2/3 w-9 rounded-[4px]" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="hidden h-3 w-8 sm:block" />
          <Skeleton className="hidden h-3 w-8 sm:block" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="size-8 justify-self-end rounded-full" />
        </div>
      ))}
    </div>
  )
}

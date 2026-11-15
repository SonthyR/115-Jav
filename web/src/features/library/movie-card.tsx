import { Link } from '@tanstack/react-router'
import { Ellipsis, PlayIcon } from 'lucide-react'

import type { LibraryMovie } from '@/api/library'
import { MediaImage } from '@/components/media-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { MovieDetailTrigger } from '@/features/movie-detail/detail-trigger'
import { cn } from 'cn'
import { LibraryMovieActions } from './movie-actions'
import { LibraryMovieStatus } from './movie-status'

export function LibraryMovieCard({
  movie,
  busy = false,
  lite = false,
  selected = false,
  selectionDisabled = false,
  onSelect
}: {
  movie: LibraryMovie
  busy?: boolean
  lite?: boolean
  selected?: boolean
  selectionDisabled?: boolean
  onSelect?: (id: number, selected: boolean) => void
}) {
  const title = movie.title || movie.code
  const year = movie.release_date?.slice(0, 4)
  const rating = movie.rating > 0 ? `★ ${movie.rating.toFixed(1)}` : undefined
  const poster = movie.poster ?? movie.cover

  return (
    <div className="group relative h-full min-w-0">
      <MovieDetailTrigger
        movie={{ libraryId: movie.id }}
        className="block h-full min-w-0 rounded-[9px] outline-ring focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <div
          className={cn(
            'relative aspect-2/3 overflow-hidden rounded-[9px] bg-muted ring-1 ring-border transition-[ring-color] duration-200 group-hover:ring-foreground/25 motion-reduce:transition-none',
            selected && 'ring-2 ring-gold'
          )}
        >
          <MediaImage
            source={poster ?? ''}
            width={360}
            alt={title}
            blurredBackground={!movie.poster}
            className={cn(
              'transition-[transform,filter] duration-300 group-hover:scale-[1.02] group-hover:brightness-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100',
              movie.poster ? 'object-cover' : 'object-contain'
            )}
          />
          <span className="pointer-events-none absolute top-2 left-2 z-20 max-w-[calc(100%-3.75rem)] truncate rounded-[4px] border border-white/20 bg-black/35 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.03em] text-white/90 backdrop-blur-sm">
            {movie.code}
          </span>
          {movie.chinese ? (
            <span className="pointer-events-none absolute top-9 right-2 z-20 rounded-[3px] border border-white/20 bg-black/35 px-1.5 py-px font-mono text-[10px] tracking-[0.02em] text-white/90 backdrop-blur-sm">
              中字
            </span>
          ) : null}
          {lite ? null : <LibraryCardPlay movie={movie} />}
          <div
            onClick={event => event.stopPropagation()}
            onPointerDown={event => event.stopPropagation()}
            className="absolute right-2 bottom-2 z-30 opacity-100 transition-opacity duration-200 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
          >
            <LibraryMovieActions
              movie={movie}
              disabled={busy}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${movie.code} 更多操作`}
                  className="size-9 rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 hover:text-white"
                >
                  <Ellipsis />
                </Button>
              }
            />
          </div>
        </div>
        <div className="min-w-0 px-0.5 pt-2.5 pb-1">
          <p className="truncate text-sm leading-5 font-medium">{title}</p>
          <p className="mt-1 truncate font-mono text-[10px] tracking-[0.03em] text-muted-foreground tabular-nums">
            {[year, rating].filter(Boolean).join(' · ') || '年份 / 评分待补'}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <LibraryMovieStatus movie={movie} />
            {movie.file_count > 1 ? (
              <Badge
                variant="outline"
                title={`${movie.file_count} 个文件`}
                className="border-border bg-card/50"
              >
                多文件
              </Badge>
            ) : null}
          </div>
        </div>
      </MovieDetailTrigger>
      <Checkbox
        aria-label={`${selected ? '取消选择' : '选择'} ${movie.code}`}
        checked={selected}
        disabled={selectionDisabled}
        onCheckedChange={value => onSelect?.(movie.id, value === true)}
        className={cn(
          'absolute top-2 right-2 z-40 size-5 border-white/60 bg-black/40 text-white backdrop-blur-sm transition-opacity data-checked:border-gold data-checked:bg-gold data-checked:text-library-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100',
          selected && '[@media(hover:hover)]:opacity-100'
        )}
      />
    </div>
  )
}

function LibraryCardPlay({ movie }: { movie: LibraryMovie }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center bg-linear-to-t from-black/65 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:hover)]:flex">
      <Link
        to="/play/$id"
        params={{ id: String(movie.id) }}
        aria-label={`播放 ${movie.code}`}
        onClick={event => event.stopPropagation()}
        className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-white text-black shadow-sm transition-transform duration-200 hover:scale-105 motion-reduce:transition-none"
      >
        <PlayIcon className="size-4 translate-x-px fill-current" />
      </Link>
    </div>
  )
}

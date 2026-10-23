import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, PlayIcon, ShuffleIcon } from 'lucide-react'
import {
  type CSSProperties,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import { imageURL } from '@/api/client'
import type { LibraryMovie } from '@/api/library'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { MovieDetailDialogContext } from '@/features/movie-detail/dialog-context'
import { useWallMovies } from './use-wall-movies'

// A press that moves less than this is a click, not a drag.
const clickSlop = 6
// Velocity kept per frame after release.
const friction = 0.94

type Point = { x: number; y: number }

function cellSize(width: number) {
  const w = width < 640 ? 112 : width < 1280 ? 160 : 190
  return { w, h: Math.round(w * 1.5) }
}

// The wall repeats the loaded posters in every direction, so it can be
// dragged without reaching an edge.
export function WallPage() {
  const [seed, setSeed] = useState(0)
  const movies = useWallMovies('added')
  const loaded = useMemo(() => movies.data?.pages.flatMap(page => page.movies) ?? [], [movies.data])
  const items = useMemo(() => shuffle(loaded, seed), [loaded, seed])

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-neutral-950 text-white select-none">
      {items.length > 0 ? (
        <Wall movies={items} />
      ) : (
        <EmptyState
          className="h-full"
          title={
            movies.isPending
              ? '正在加载海报…'
              : movies.isError
                ? '海报加载失败'
                : '媒体库里还没有影片'
          }
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-linear-to-b from-black/70 to-transparent p-3 pb-10 sm:p-4">
        <Button
          asChild
          variant="secondary"
          size="icon"
          className="pointer-events-auto rounded-full"
          aria-label="返回媒体库"
        >
          <Link to="/">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <span className="text-sm text-white/80">
          海报墙 · {loaded.length}
          {movies.hasNextPage ? '+' : ''} 部
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="pointer-events-auto ml-auto rounded-full"
          onClick={() => setSeed(value => value + 1)}
        >
          <ShuffleIcon data-icon="inline-start" />
          打乱
        </Button>
      </div>
    </div>
  )
}

function Wall({ movies }: { movies: LibraryMovie[] }) {
  const openMovie = useContext(MovieDetailDialogContext)
  const viewport = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const offset = useRef<Point>({ x: 0, y: 0 })
  const velocity = useRef<Point>({ x: 0, y: 0 })
  const drag = useRef<{ start: Point; last: Point; time: number; moved: boolean } | null>(null)
  const frame = useRef(0)
  const suppressClick = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [origin, setOrigin] = useState({ col: 0, row: 0 })
  const cell = cellSize(size.width)
  const columns = Math.max(
    1,
    Math.ceil(Math.sqrt((movies.length * (size.width / Math.max(size.height, 1))) / 1.5))
  )

  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const apply = () => {
    const { x, y } = offset.current
    if (layer.current) layer.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
    const col = Math.floor(-x / cell.w)
    const row = Math.floor(-y / cell.h)
    setOrigin(current => (current.col === col && current.row === row ? current : { col, row }))
  }

  const move = (dx: number, dy: number) => {
    offset.current = { x: offset.current.x + dx, y: offset.current.y + dy }
    apply()
  }

  const glide = () => {
    velocity.current = { x: velocity.current.x * friction, y: velocity.current.y * friction }
    move(velocity.current.x, velocity.current.y)
    if (Math.hypot(velocity.current.x, velocity.current.y) > 0.3)
      frame.current = requestAnimationFrame(glide)
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  // Keep the cell grid aligned when the cell size changes with the window.
  useLayoutEffect(apply, [cell.w, cell.h])

  const cols = Math.ceil(size.width / cell.w) + 2
  const rows = Math.ceil(size.height / cell.h) + 2
  const cells = []
  for (let r = origin.row - 1; r < origin.row - 1 + rows; r++) {
    for (let c = origin.col - 1; c < origin.col - 1 + cols; c++) {
      const index = mod(
        mod(r, Math.ceil(movies.length / columns)) * columns + mod(c, columns),
        movies.length
      )
      cells.push({ key: `${c}:${r}`, x: c * cell.w, y: r * cell.h, movie: movies[index]! })
    }
  }

  return (
    <div
      ref={viewport}
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={event => {
        cancelAnimationFrame(frame.current)
        velocity.current = { x: 0, y: 0 }
        const point = { x: event.clientX, y: event.clientY }
        drag.current = { start: point, last: point, time: performance.now(), moved: false }
      }}
      onPointerMove={event => {
        const state = drag.current
        if (!state) return
        const point = { x: event.clientX, y: event.clientY }
        if (
          !state.moved &&
          Math.hypot(point.x - state.start.x, point.y - state.start.y) > clickSlop
        ) {
          state.moved = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        if (!state.moved) return
        const now = performance.now()
        const elapsed = Math.max(now - state.time, 1)
        // Velocity in pixels per 16 ms frame, for the glide after release.
        velocity.current = {
          x: ((point.x - state.last.x) / elapsed) * 16,
          y: ((point.y - state.last.y) / elapsed) * 16
        }
        move(point.x - state.last.x, point.y - state.last.y)
        drag.current = { ...state, last: point, time: now }
      }}
      onPointerUp={() => {
        const state = drag.current
        drag.current = null
        suppressClick.current = state?.moved ?? false
        if (state?.moved && performance.now() - state.time < 80)
          frame.current = requestAnimationFrame(glide)
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onClickCapture={event => {
        // A drag that ends over a poster must not open it.
        if (suppressClick.current) event.stopPropagation()
        suppressClick.current = false
      }}
      onWheel={event => {
        cancelAnimationFrame(frame.current)
        move(-event.deltaX, -event.deltaY)
      }}
    >
      <div ref={layer} className="absolute top-0 left-0 will-change-transform">
        {cells.map(({ key, x, y, movie }) => (
          <Poster
            key={key}
            movie={movie}
            style={{ left: x, top: y, width: cell.w, height: cell.h }}
            onOpen={(play, element) => openMovie?.({ libraryId: movie.id, play }, element)}
          />
        ))}
      </div>
    </div>
  )
}

function Poster({
  movie,
  style,
  onOpen
}: {
  movie: LibraryMovie
  style: CSSProperties
  onOpen: (play: boolean, element: HTMLDivElement) => void
}) {
  const source = movie.poster ?? movie.cover
  return (
    <div
      role="button"
      tabIndex={0}
      className="group absolute p-1 outline-none sm:p-1.5"
      style={style}
      onClick={event => onOpen(false, event.currentTarget)}
      onKeyDown={event => {
        if (event.key === 'Enter') onOpen(false, event.currentTarget)
      }}
    >
      <div className="relative h-full overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-white/5 transition-transform duration-200 group-hover:z-10 group-hover:scale-[1.04] group-focus-visible:ring-2 group-focus-visible:ring-white">
        {source ? (
          <img
            src={imageURL(source)}
            alt={movie.code}
            loading="lazy"
            draggable={false}
            className={`h-full w-full ${movie.poster ? 'object-cover' : 'object-contain'}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/50">
            {movie.code}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-transparent p-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden">
          <p className="truncate text-xs font-semibold">{movie.code}</p>
          <p className="truncate text-[11px] text-white/70">{movie.title}</p>
        </div>
        <button
          type="button"
          aria-label={`播放 ${movie.code}`}
          className="absolute top-1/2 left-1/2 flex size-11 -translate-1/2 items-center justify-center rounded-full bg-black/60 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:hidden"
          onClick={event => {
            event.stopPropagation()
            onOpen(true, event.currentTarget.closest('[role=button]') as HTMLDivElement)
          }}
        >
          <PlayIcon className="size-5 translate-x-px fill-current" />
        </button>
      </div>
    </div>
  )
}

function mod(value: number, size: number) {
  return ((value % size) + size) % size
}

// Seed 0 keeps the library order; each shuffle gives a new stable order.
function shuffle<T>(items: T[], seed: number) {
  if (seed === 0) return items
  let state = seed * 2654435761
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

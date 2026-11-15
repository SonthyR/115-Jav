import { createFileRoute, Navigate, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, PlayIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useLite } from '@/api/auth'
import { useLibraryMovie } from '@/api/library'
import { MediaImage } from '@/components/media-image'
import { Button } from '@/components/ui/button'
import { MoviePlayer } from '@/features/player/player'
import { usePlaylist } from '@/features/player/playlist'

// list marks a collection playing in order, so the next movie follows.
type PlaySearch = { file?: string; restart?: boolean; list?: boolean }

export const Route = createFileRoute('/play/$id')({
  validateSearch: (search: Record<string, unknown>): PlaySearch => ({
    file: typeof search.file === 'string' && search.file ? search.file : undefined,
    restart: search.restart === true || search.restart === 'true' ? true : undefined,
    list: search.list === true || search.list === 'true' ? true : undefined
  }),
  beforeLoad: ({ params }) => {
    if (!/^[1-9]\d*$/.test(params.id)) throw notFound()
  },
  component: PlayGate
})

// Lite servers do not play in the browser; the movie page stands in.
function PlayGate() {
  const params = Route.useParams()
  return useLite() ? <Navigate to="/movie/$id" params={params} replace /> : <PlayRoute />
}

// Playback fills the whole window; everything else sits on the overlay.
function PlayRoute() {
  const { id } = Route.useParams()
  const { file, restart, list } = Route.useSearch()
  const movieId = Number(id)
  const router = useRouter()
  const navigate = useNavigate()
  const detail = useLibraryMovie(movieId)
  const next = usePlaylist(state => state.next)
  const title = detail.data ? `${detail.data.code} ${detail.data.title}` : undefined
  const following = list ? next(movieId) : undefined
  const goBack = () =>
    window.history.length > 1
      ? router.history.back()
      : void navigate({ to: '/movie/$id', params: { id } })
  // Set once the movie ends with another one queued after it.
  const [ending, setEnding] = useState(false)
  const playNext = () => {
    if (!following) return
    setEnding(false)
    void navigate({
      to: '/play/$id',
      params: { id: String(following) },
      search: { list: true },
      replace: true
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="w-full">
        <MoviePlayer
          key={`${id}:${file ?? ''}:${restart ? 1 : 0}`}
          movieId={movieId}
          variant="page"
          title={title}
          startFile={file}
          restart={restart}
          topLeft={
            <button
              type="button"
              aria-label="返回"
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/25 text-white backdrop-blur-md transition-colors hover:border-white/35 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
              onClick={goBack}
            >
              <ArrowLeftIcon className="size-5" />
            </button>
          }
          onBack={goBack}
          onNext={following ? playNext : undefined}
          onFinished={() => {
            if (following) setEnding(true)
          }}
        />
      </div>
      {ending && following ? (
        <UpNext movieId={following} onPlay={playNext} onCancel={() => setEnding(false)} />
      ) : null}
    </div>
  )
}

// Seconds before the next movie of a collection starts on its own.
const upNextDelay = 8

function UpNext({
  movieId,
  onPlay,
  onCancel
}: {
  movieId: number
  onPlay: () => void
  onCancel: () => void
}) {
  const movie = useLibraryMovie(movieId)
  const [left, setLeft] = useState(upNextDelay)
  useEffect(() => {
    if (left <= 0) {
      onPlay()
      return
    }
    const timer = setTimeout(() => setLeft(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [left, onPlay])
  const cover = movie.data?.cover
  return (
    <div className="dark absolute right-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-20 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-white/15 bg-[#0d0d11]/95 text-foreground shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-md sm:right-5 sm:bottom-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="relative aspect-video bg-black">
        {cover ? (
          <MediaImage
            source={cover}
            width={720}
            alt={movie.data ? `${movie.data.code} ${movie.data.title}` : ''}
            loading="eager"
            className="object-cover"
          />
        ) : null}
        <span className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/65 via-transparent to-transparent" />
        <span
          aria-live="polite"
          className="absolute top-2 left-2 rounded-full border border-white/15 bg-black/65 px-2 py-1 font-mono text-[10px] tracking-[0.04em] text-white backdrop-blur-sm"
        >
          {left} 秒后播放下一部
        </span>
      </div>
      <div className="space-y-3 p-3.5">
        <div className="space-y-1">
          <p className="line-clamp-1 text-sm font-medium">{movie.data?.title || '下一部'}</p>
          <p className="font-mono text-[10px] tracking-[0.06em] text-white/45 tabular-nums">
            {movie.data
              ? [movie.data.code, movie.data.duration > 0 ? `${movie.data.duration} 分钟` : null]
                  .filter(Boolean)
                  .join(' · ')
              : '正在读取下一部影片'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-8 flex-1 bg-white text-black hover:bg-white/90"
            onClick={onPlay}
          >
            <PlayIcon data-icon="inline-start" className="fill-current" />
            立即播放
          </Button>
          <Button size="sm" variant="secondary" className="h-8 px-3" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    </div>
  )
}

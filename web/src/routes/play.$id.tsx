import { createFileRoute, Navigate, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, PlayIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useLite } from '@/api/auth'
import { imageURL } from '@/api/client'
import { useLibraryMovie } from '@/api/library'
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
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
              onClick={() =>
                window.history.length > 1
                  ? router.history.back()
                  : void navigate({ to: '/movie/$id', params: { id } })
              }
            >
              <ArrowLeftIcon className="size-5" />
            </button>
          }
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
    <div className="dark absolute right-4 bottom-28 z-10 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg bg-neutral-900/95 text-foreground shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <div className="relative aspect-video bg-black">
        {cover ? (
          <img src={imageURL(cover, 720)} alt="" className="size-full object-cover" />
        ) : null}
        <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white">
          {left} 秒后播放下一部
        </span>
      </div>
      <div className="space-y-3 p-3">
        <p className="line-clamp-2 text-sm font-medium">
          {movie.data ? `${movie.data.code} ${movie.data.title}` : '下一部'}
        </p>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 rounded-full" onClick={onPlay}>
            <PlayIcon data-icon="inline-start" className="fill-current" />
            立即播放
          </Button>
          <Button size="sm" variant="secondary" className="rounded-full" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    </div>
  )
}

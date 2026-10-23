import { createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { useLibraryMovie } from '@/api/library'
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
  component: PlayRoute
})

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
          onFinished={() => {
            const following = list ? next(movieId) : undefined
            if (following)
              void navigate({
                to: '/play/$id',
                params: { id: String(following) },
                search: { list: true },
                replace: true
              })
          }}
        />
      </div>
    </div>
  )
}

import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, CheckIcon, Ellipsis, PlayIcon, RefreshCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useLite } from '@/api/auth'
import { imageURL } from '@/api/client'
import {
  findFacet,
  type LibraryFacetKind,
  type LibraryMovieDetail,
  useLibraryFacets,
  useLibraryMovie,
  useLibraryMovies
} from '@/api/library'
import { useMarkPlayed, usePlayInfo } from '@/api/playback'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { CollectionButton } from '@/features/collections/collection-button'
import { LibraryMovieActions } from '@/features/library/movie-actions'
import { MoviePreviews } from '@/features/movie-detail/previews'
import { formatTime } from '@/features/player/player'
import { formatSize } from '@/lib/format'
import { cn } from 'cn'
import { ActorPortrait } from './actor-portrait'
import { PosterCard } from './poster-card'
import { Row } from './row'

// The cover fills the top of the page with the title and one play button on
// it; who is in it, the details and the versions follow below.
export function WatchMoviePage({ id }: { id: number }) {
  const router = useRouter()
  const lite = useLite()
  const detail = useLibraryMovie(id)
  const play = usePlayInfo(id)
  const mark = useMarkPlayed(id)
  if (detail.isPending) {
    return <div className="-mt-16 h-[34rem] animate-pulse bg-muted/40 sm:h-[44rem]" />
  }
  if (!detail.data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <ErrorState
          message="影片详情加载失败"
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      </div>
    )
  }
  const movie = detail.data
  const files = play.data?.files ?? []
  const progress = play.data?.progress
  const resumable = progress && progress.position > 10
  const resumeFile = files.findIndex(file => file.file_id === progress?.file_id)
  const played = !!progress?.played

  return (
    <div className="pb-24">
      <section className="relative isolate -mt-16 flex min-h-[34rem] items-end overflow-hidden pt-28 sm:min-h-[44rem]">
        {movie.cover ? (
          <img
            src={imageURL(movie.cover)}
            alt=""
            className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-right lg:w-4/5"
          />
        ) : null}
        <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-linear-to-b from-background/80 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/70 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-background via-background/20 to-transparent" />
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:pb-16">
          <button
            type="button"
            className="absolute top-20 flex items-center gap-2 text-sm tracking-wide text-foreground/80 transition-colors hover:text-foreground"
            onClick={() =>
              window.history.length > 1 ? router.history.back() : router.navigate({ to: '/' })
            }
          >
            <ArrowLeftIcon className="size-4" strokeWidth={1.5} />
            返回
          </button>
          <div className="max-w-2xl space-y-5">
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] tracking-wider text-muted-foreground">
              <span>{movie.code}</span>
              {movie.release_date ? <span>{movie.release_date}</span> : null}
              {movie.duration > 0 ? <span>{movie.duration} 分钟</span> : null}
              {movie.rating > 0 ? (
                <span className="text-foreground">★ {movie.rating.toFixed(1)}</span>
              ) : null}
              {movie.scrape_status === 'pending' ? <span>刮削中…</span> : null}
            </p>
            <div className="space-y-2">
              <h1 className="font-serif text-3xl leading-tight font-semibold tracking-wide sm:text-5xl">
                {movie.title || movie.code}
              </h1>
              {movie.origin_title && movie.origin_title !== movie.title ? (
                <p className="text-sm tracking-wide text-muted-foreground">{movie.origin_title}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {lite ? null : (
                <>
                  <Button
                    asChild
                    size="lg"
                    className="h-12 rounded-full px-7 tracking-wide max-sm:w-full"
                    disabled={files.length === 0}
                  >
                    <Link to="/play/$id" params={{ id: String(id) }}>
                      <PlayIcon data-icon="inline-start" className="fill-current" />
                      {resumable ? `继续播放 · ${formatTime(progress.position)}` : '播放'}
                    </Link>
                  </Button>
                  {resumable ? (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="h-12 rounded-full px-6 tracking-wide"
                    >
                      <Link
                        to="/play/$id"
                        params={{ id: String(id) }}
                        search={{ file: files[0]?.file_id, restart: true }}
                      >
                        从头播放
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    size="icon-lg"
                    variant="outline"
                    aria-pressed={played}
                    title={played ? '看过（再点一下取消）' : '标为看过'}
                    className={cn('size-12', played && 'border-gold text-gold hover:border-gold')}
                    disabled={mark.isPending || files.length === 0}
                    onClick={() => mark.mutate(!played)}
                  >
                    <CheckIcon strokeWidth={1.75} />
                    <span className="sr-only">{played ? '看过' : '标为看过'}</span>
                  </Button>
                </>
              )}
              <CollectionButton movieId={id} look="icon" />
              <LibraryMovieActions
                movie={{ id, code: movie.code }}
                disabled={movie.scrape_status === 'pending'}
                trigger={
                  <Button
                    size="icon-lg"
                    variant="outline"
                    className="size-12"
                    title="管理：重新刮削、修正番号"
                    aria-label="管理"
                  >
                    {movie.scrape_status === 'pending' ? (
                      <RefreshCwIcon className="animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Ellipsis strokeWidth={1.75} />
                    )}
                  </Button>
                }
              />
            </div>
            {resumable ? (
              <span className="block h-0.5 w-full max-w-xs bg-foreground/15">
                <span
                  className="block h-full bg-gold"
                  style={{
                    width: `${Math.min(100, (progress.position / progress.duration) * 100)}%`
                  }}
                />
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-4">
        <section className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
          <div className="space-y-10">
            {movie.actors.length > 0 ? <Cast actors={movie.actors} /> : null}
            <Details movie={movie} />
          </div>
          {lite || !play.data ? null : (
            <div className="space-y-4">
              <Label>版本</Label>
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">这部影片没有可播放的 115 视频。</p>
              ) : (
                <div className="divide-y divide-border border-y border-border">
                  {files.map((file, index) => (
                    <Link
                      key={file.file_id}
                      to="/play/$id"
                      params={{ id: String(id) }}
                      search={{ file: file.file_id }}
                      className="group flex items-center gap-4 py-4"
                    >
                      <span
                        className={cn(
                          'w-0.5 self-stretch',
                          index === resumeFile && resumable ? 'bg-gold' : 'bg-transparent'
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{file.name}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatSize(file.size)}
                          {index === resumeFile && resumable
                            ? ` · 看到 ${formatTime(progress.position)}`
                            : ''}
                        </span>
                      </span>
                      <PlayIcon className="size-4 shrink-0 fill-current text-muted-foreground transition-colors group-hover:text-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
        <MoviePreviews images={movie.preview_images} />
        {movie.actors[0] ? <MoreWithActor name={movie.actors[0].name} movieId={id} /> : null}
      </div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-medium tracking-[0.2em] text-muted-foreground">{children}</h2>
}

function Cast({ actors }: { actors: LibraryMovieDetail['actors'] }) {
  const facets = useLibraryFacets()
  return (
    <div className="space-y-4">
      <Label>演员</Label>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {actors.map(actor => {
          const facet = findFacet(facets.data?.actors, actor.name)
          return (
            <Link
              key={`${actor.provider}:${actor.id || actor.name}`}
              to="/browse/$kind/$name"
              params={{ kind: 'actor', name: facet?.name ?? actor.name }}
              className="group flex items-center gap-3.5"
            >
              <ActorPortrait
                name={actor.name}
                alias={facet?.alias}
                avatar={actor.avatar || facet?.avatar}
                className="size-14 transition group-hover:brightness-110"
              />
              <span>
                <span className="block text-[15px]">{actor.name}</span>
                {facet ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    片库 {facet.count} 部
                  </span>
                ) : null}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function Details({ movie }: { movie: LibraryMovieDetail }) {
  const rows: Array<[string, ReactNode]> = []
  const entity = (kind: LibraryFacetKind, name: string) => (
    <Link
      to="/browse/$kind/$name"
      params={{ kind, name }}
      className="underline decoration-foreground/20 underline-offset-4 transition-colors hover:decoration-foreground/60"
    >
      {name}
    </Link>
  )
  if (movie.maker) rows.push(['厂牌', entity('maker', movie.maker.name)])
  if (movie.series) rows.push(['系列', entity('series', movie.series.name)])
  if (movie.director) rows.push(['导演', movie.director.name])
  if (movie.tags.length > 0) {
    rows.push([
      '标签',
      <span key="tags" className="flex flex-wrap gap-2">
        {movie.tags.map(tag => (
          <Link
            key={`${tag.provider}:${tag.id || tag.name}`}
            to="/browse/$kind/$name"
            params={{ kind: 'tag', name: tag.name }}
            className="rounded-full border border-foreground/15 px-3 py-0.5 text-xs text-foreground/80 transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            {tag.name}
          </Link>
        ))}
      </span>
    ])
  }
  if (rows.length === 0) return null
  return (
    <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] border-b border-border text-sm">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="col-span-2 grid grid-cols-subgrid border-t border-border py-3.5"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function MoreWithActor({ name, movieId }: { name: string; movieId: number }) {
  const result = useLibraryMovies(1, { actor: name })
  const movies = result.data?.movies.filter(movie => movie.id !== movieId) ?? []
  if (movies.length === 0) return null
  return (
    <Row
      title={`${name} 的其他影片`}
      link={{ to: '/browse/$kind/$name', params: { kind: 'actor', name } }}
    >
      {movies.map(movie => (
        <PosterCard key={movie.id} movie={movie} className="w-32 shrink-0 snap-start sm:w-44" />
      ))}
    </Row>
  )
}

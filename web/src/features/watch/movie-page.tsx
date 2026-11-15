import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, CheckIcon, Ellipsis, PlayIcon, RefreshCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useLite } from '@/api/auth'
import { useDiscoverMagnets } from '@/api/discover'
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
import { MediaImage } from '@/components/media-image'
import { Button } from '@/components/ui/button'
import { CollectionButton } from '@/features/collections/collection-button'
import { LibraryMovieActions } from '@/features/library/movie-actions'
import { MovieMagnets } from '@/features/movie-detail/magnets'
import { MovieSynopsis, MovieTagRow } from '@/features/movie-detail/metadata'
import { MoviePreviews } from '@/features/movie-detail/previews'
import { MovieDetailSkeleton } from '@/features/movie-detail/skeleton'
import { MovieSubscriptionAction } from '@/features/movie-detail/subscription-action'
import { formatTime } from '@/features/player/player'
import { formatSize } from '@/lib/format'
import { cn } from 'cn'
import { ActorPortrait } from './actor-portrait'
import { PosterCard } from './poster-card'
import { Row } from './row'

const contentClass = 'mx-auto w-full max-w-[1200px] px-5 md:px-12'
const panelLabel = 'text-sm font-medium tracking-[0.08em]'

export function WatchMoviePage({ id }: { id: number }) {
  const detail = useLibraryMovie(id)
  if (detail.isPending) return <MovieDetailSkeleton page />
  if (!detail.data) {
    return (
      <main className="dark relative isolate -mt-[60px] flex min-h-[75dvh] items-center overflow-hidden bg-[#08080a] px-5 pt-24 pb-16 text-[#f3f0e9]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_65%_20%,rgba(201,178,124,0.13),transparent_70%)]" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-background via-transparent to-transparent" />
        <ErrorState
          className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-black/25 px-6 py-10 backdrop-blur-sm"
          message="影片详情加载失败"
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      </main>
    )
  }
  return <WatchMovieContent id={id} movie={detail.data} />
}

function WatchMovieContent({ id, movie }: { id: number; movie: LibraryMovieDetail }) {
  const router = useRouter()
  const lite = useLite()
  const play = usePlayInfo(id)
  const mark = useMarkPlayed(id)
  const files = play.data?.files ?? []
  const progress = play.data?.progress
  const resumable = progress && progress.position > 10
  const resumeFile = files.findIndex(file => file.file_id === progress?.file_id)
  const played = !!progress?.played
  const backdrop = movie.cover
  const year = movie.release_date?.slice(0, 4)
  const status =
    movie.scrape_status === 'pending'
      ? '待刮削'
      : movie.scrape_status === 'failed'
        ? '刮削失败'
        : '已入库'

  return (
    <main className="pb-24">
      <section className="dark relative isolate -mt-[60px] flex min-h-[34rem] overflow-hidden bg-[#08080a] text-[#f3f0e9] sm:min-h-[40rem]">
        <div className="absolute inset-0 -z-20">
          <MediaImage
            source={backdrop}
            width={720}
            loading="eager"
            alt=""
            className="object-cover object-[70%_25%] sm:object-center"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0_1px,transparent_1px_3px)] opacity-25" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-t from-[#08080a] from-3% via-[#08080a]/68 via-40% to-transparent to-75%" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-[#08080a]/90 from-0% via-[#08080a]/35 via-42% to-transparent to-72%" />

        <div
          className={cn(
            contentClass,
            'relative flex min-h-[34rem] flex-col pt-24 pb-12 sm:min-h-[40rem] sm:pb-16'
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 bg-black/30 px-3.5 font-mono text-xs tracking-[0.08em] text-white/85 backdrop-blur-md transition-colors hover:border-white/35 hover:bg-black/45 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
              onClick={() =>
                window.history.length > 1 ? router.history.back() : router.navigate({ to: '/' })
              }
            >
              <ArrowLeftIcon className="size-4" strokeWidth={1.5} />
              返回
            </button>
            <span className="rounded-full border border-white/15 bg-black/30 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.08em] text-white/65 backdrop-blur-md">
              {status}
            </span>
          </div>

          <div className="mt-auto max-w-[780px] space-y-5 pt-12">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tracking-[0.03em] text-white/60 tabular-nums">
              <span className="text-white">{movie.code}</span>
              {year ? <span>{year}</span> : null}
              {movie.duration > 0 ? <span>{movie.duration} 分钟</span> : null}
              {movie.rating > 0 ? (
                <span className="text-white">★ {movie.rating.toFixed(1)}</span>
              ) : null}
              {movie.scrape_status === 'pending' ? <span>刮削中…</span> : null}
            </p>
            <div className="space-y-2">
              <h1 className="font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.04] font-bold tracking-[-0.035em] text-balance">
                {movie.title || movie.code}
              </h1>
              {movie.origin_title && movie.origin_title !== movie.title ? (
                <p className="max-w-2xl text-sm leading-6 tracking-[0.02em] text-white/55">
                  {movie.origin_title}
                </p>
              ) : null}
            </div>
            <MovieTagRow tags={movie.tags} library />
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {lite ? null : (
                <>
                  <Button
                    asChild
                    size="lg"
                    className="h-10 px-5 text-sm max-sm:w-full"
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
                      className="h-10 border-white/20 bg-black/15 px-4 text-sm backdrop-blur-sm hover:border-white/35 hover:bg-white/10"
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
                    className={cn(
                      'border-white/20 bg-black/15 backdrop-blur-sm hover:border-white/35 hover:bg-white/10',
                      played && 'border-gold text-gold hover:border-gold'
                    )}
                    disabled={mark.isPending || files.length === 0}
                    onClick={() => mark.mutate(!played)}
                  >
                    <CheckIcon strokeWidth={1.75} />
                    <span className="sr-only">{played ? '看过' : '标为看过'}</span>
                  </Button>
                </>
              )}
              <CollectionButton movieId={id} look="icon" />
              {lite ? null : <MovieSubscriptionAction movieID={movie.id} look="action" />}
              <LibraryMovieActions
                movie={{ id, code: movie.code }}
                disabled={movie.scrape_status === 'pending'}
                trigger={
                  <Button
                    size="icon-lg"
                    variant="outline"
                    className="border-white/20 bg-black/15 backdrop-blur-sm hover:border-white/35 hover:bg-white/10"
                    title="管理：重新刮削、纠正番号"
                    aria-label="更多"
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
              <span className="block h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-white/20">
                <span
                  className="block h-full rounded-full bg-gold"
                  style={{
                    width: `${Math.min(100, (progress.position / progress.duration) * 100)}%`
                  }}
                />
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className={cn(contentClass, 'pt-10')}>
        <div
          className={cn(
            'grid items-start gap-10',
            !lite && 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.92fr)] lg:gap-14'
          )}
        >
          <div className="min-w-0 space-y-10">
            <section className="space-y-3">
              <SectionLabel>简介</SectionLabel>
              <MovieSynopsis movie={movie} />
            </section>
            {movie.actors.length > 0 ? <Cast actors={movie.actors} /> : null}
            <Details movie={movie} />
          </div>

          {lite ? null : (
            <aside className="min-w-0 space-y-9 lg:sticky lg:top-20">
              <MagnetPanel movieID={movie.id} />
              {!play.data ? null : (
                <section className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className={panelLabel}>文件</h2>
                    <span className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
                      {files.length} 个
                    </span>
                  </div>
                  {files.length === 0 ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      这部影片没有可播放的 115 视频。
                    </p>
                  ) : (
                    <div className="divide-y divide-border/60 border-y border-border/60">
                      {files.map((file, index) => (
                        <Link
                          key={file.file_id}
                          to="/play/$id"
                          params={{ id: String(id) }}
                          search={{ file: file.file_id }}
                          className="group flex items-center gap-3 py-3.5 outline-ring"
                        >
                          <span
                            className={cn(
                              'w-0.5 self-stretch rounded-full',
                              index === resumeFile && resumable ? 'bg-gold' : 'bg-transparent'
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{file.name}</span>
                            <span className="mt-1 block font-mono text-[11px] text-muted-foreground tabular-nums">
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
                </section>
              )}
            </aside>
          )}
        </div>

        <div className="space-y-14 pt-16">
          <MoviePreviews images={movie.preview_images} />
          {movie.actors[0] ? <MoreWithActor name={movie.actors[0].name} movieId={id} /> : null}
        </div>
      </div>
    </main>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className={panelLabel}>{children}</h2>
}

function MagnetPanel({ movieID }: { movieID: string }) {
  const magnets = useDiscoverMagnets(movieID)
  return <MovieMagnets movieID={movieID} query={magnets} showSubscription={false} />
}

function Cast({ actors }: { actors: LibraryMovieDetail['actors'] }) {
  const facets = useLibraryFacets()
  return (
    <section className="space-y-4">
      <SectionLabel>演员</SectionLabel>
      <div className="flex flex-wrap gap-x-7 gap-y-4">
        {actors.map(actor => {
          const facet = findFacet(facets.data?.actors, actor.name)
          return (
            <Link
              key={`${actor.provider}:${actor.id || actor.name}`}
              to="/browse/$kind/$name"
              params={{ kind: 'actor', name: facet?.name ?? actor.name }}
              className="group flex items-center gap-3.5 outline-ring"
            >
              <ActorPortrait
                name={actor.name}
                alias={facet?.alias}
                avatar={actor.avatar || facet?.avatar}
                className="size-12 transition group-hover:brightness-110"
              />
              <span>
                <span className="block text-sm tracking-[0.02em]">{actor.name}</span>
                {facet ? (
                  <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                    片库 {facet.count} 部
                  </span>
                ) : null}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
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
  if (rows.length === 0) return null
  return (
    <section className="space-y-4">
      <SectionLabel>影片资料</SectionLabel>
      <dl className="divide-y divide-border/60 border-y border-border/60 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-3 py-3">
            <dt className="font-mono text-[11px] leading-6 tracking-[0.08em] text-muted-foreground">
              {label}
            </dt>
            <dd className="min-w-0 leading-6">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
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

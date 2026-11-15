import { Link } from '@tanstack/react-router'
import { BookmarkIcon, PlayIcon, RefreshCwIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { imageURL } from '@/api/client'
import { useCollections } from '@/api/collections'
import {
  LIBRARY_PAGE_SIZE,
  type LibraryFacet,
  type LibraryFilter,
  type LibraryMovie,
  useLibraryFacets,
  useLibraryMovies
} from '@/api/library'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { MovieCover } from '@/components/movie/movie-cover'
import { Button } from '@/components/ui/button'
import { CollectionButton } from '@/features/collections/collection-button'
import { cn } from 'cn'
import { useSettingsStore } from '@/stores/settings'
import { ActorTile } from './actor-tile'
import { ContinueWatching } from './continue-watching'
import { PosterCard, PosterSkeletons } from './poster-card'
import { Row } from './row'

const posterClass = 'w-[124px] shrink-0 snap-start sm:w-[152px]'
const contentClass = 'mx-auto w-full max-w-[1200px] px-5 md:px-12'
const heroCount = 5
const heroInterval = 8000

export function WatchHome() {
  const recent = useLibraryMovies(1, {})
  const collections = useCollections()
  const facets = useLibraryFacets()
  const movies = recent.data?.movies ?? []
  // Two of the most common tags each get a row, a different pair per visit.
  const [seed] = useState(() => Math.random())
  const tags = pickTags(facets.data?.tags ?? [], seed)

  if (recent.isPending) return <HomeLoading />
  if (recent.isError) {
    return (
      <main className="pb-20 md:pb-24">
        <div className={cn(contentClass, 'pt-24')}>
          <ErrorState
            message="首页内容加载失败，请检查后端服务后重试"
            onRetry={() => void recent.refetch()}
            retrying={recent.isFetching}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="pb-20 md:pb-24">
      <Hero movies={movies} />
      <div className={cn(contentClass, 'space-y-[38px] pt-10')}>
        <ContinueWatching />

        {movies.length > 0 ? (
          <Row title="最近入库" link={{ to: '/browse' }}>
            {movies.map(movie => (
              <PosterCard key={movie.id} movie={movie} className={posterClass} />
            ))}
          </Row>
        ) : recent.data ? (
          <EmptyState
            className="py-12"
            title={recent.data.source ? '媒体库里还没有影片' : '还没有连接 115'}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link to="/settings">
                  {recent.data.source ? '还没有影片，去设置检查媒体目录' : '去设置连接 115'}
                </Link>
              </Button>
            }
          />
        ) : null}

        {facets.data?.actors.length ? (
          <Row title="演员" link={{ to: '/actors' }}>
            {facets.data.actors.slice(0, 20).map(actor => (
              <ActorTile
                key={actor.name}
                actor={actor}
                className="w-26 shrink-0 snap-start sm:w-30"
              />
            ))}
          </Row>
        ) : null}

        <MovieRow title="中文字幕" filter={{ chinese: true }} />
        <RandomRow />
        <MovieRow title="最新发行" filter={{ sort: 'release' }} />
        <MovieRow title="高分影片" filter={{ sort: 'rating' }} />
        {tags.map(tag => (
          <MovieRow key={tag} title={tag} filter={{ tag }} />
        ))}

        {collections.data?.length ? (
          <Row title="收藏夹" link={{ to: '/collections' }}>
            {collections.data.map(item => (
              <Link
                key={item.id}
                to="/collections/$id"
                params={{ id: String(item.id) }}
                className="group w-48 shrink-0 snap-start outline-ring sm:w-60"
              >
                <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[9px] border border-border bg-card">
                  {item.cover ? (
                    <div className="absolute inset-0 transition-[transform,filter] duration-300 group-hover:scale-[1.02] group-hover:brightness-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                      <MovieCover source={item.cover} width={720} />
                    </div>
                  ) : (
                    <BookmarkIcon className="size-7 text-muted-foreground" strokeWidth={1.5} />
                  )}
                </div>
                <p className="mt-3 truncate text-xs">
                  {item.name}
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground tabular-nums">
                    · {item.count} 部
                  </span>
                </p>
              </Link>
            ))}
          </Row>
        ) : null}
      </div>
    </main>
  )
}

function HomeLoading() {
  return (
    <main className="pb-20 md:pb-24" aria-busy="true">
      <section
        className="relative -mt-[60px] flex min-h-[470px] items-end overflow-hidden bg-muted md:min-h-[540px]"
        aria-hidden="true"
      >
        <div className="absolute inset-0 animate-pulse bg-[radial-gradient(70%_70%_at_72%_20%,var(--muted),transparent_68%)] motion-reduce:animate-none" />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/55 to-transparent" />
        <div className={cn(contentClass, 'relative z-10 pb-9 md:pb-14')}>
          <div className="max-w-[680px] space-y-4">
            <div className="h-3 w-44 animate-pulse rounded-sm bg-foreground/10 motion-reduce:animate-none" />
            <div className="h-11 w-4/5 animate-pulse rounded-sm bg-foreground/10 motion-reduce:animate-none md:h-16 md:max-w-xl" />
            <div className="h-4 w-52 animate-pulse rounded-sm bg-foreground/10 motion-reduce:animate-none" />
            <div className="flex gap-2.5 pt-2">
              <div className="h-10 w-24 animate-pulse rounded-full bg-foreground/10 motion-reduce:animate-none" />
              <div className="h-10 w-20 animate-pulse rounded-full bg-foreground/10 motion-reduce:animate-none" />
              <div className="size-10 animate-pulse rounded-full bg-foreground/10 motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      </section>
      <div className={cn(contentClass, 'pt-10')}>
        <div className="space-y-3.5">
          <div className="h-5 w-28 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
          <div className="-mx-5 flex gap-3.5 overflow-hidden px-5 pb-1 md:-mx-12 md:px-12">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className={posterClass}>
                <PosterSkeletons count={1} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

// A row of library movies matching a filter; empty rows are left out.
function MovieRow({ title, filter }: { title: string; filter: LibraryFilter }) {
  const result = useLibraryMovies(1, filter)
  if (!result.data?.movies.length) return null
  return (
    <Row title={title} link={{ to: '/browse', search: filter }}>
      {result.data.movies.map(movie => (
        <PosterCard key={movie.id} movie={movie} className={posterClass} />
      ))}
    </Row>
  )
}

// A random page of the movies not watched yet, so older films come back into view.
function RandomRow() {
  const unwatched = useLibraryMovies(1, { watched: 'no' }, 1)
  const pages = Math.ceil((unwatched.data?.total ?? 0) / LIBRARY_PAGE_SIZE)
  const [roll, setRoll] = useState(() => Math.random())
  const page = 1 + Math.floor(roll * pages)
  const result = useLibraryMovies(page, { watched: 'no' })
  if (pages < 1 || !result.data?.movies.length) return null
  const movies = shuffle(result.data.movies, roll)
  return (
    <Row
      title="随便看看"
      link={{ to: '/browse', search: { watched: 'no' } }}
      action={
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs tracking-[0.03em] text-muted-foreground transition-colors hover:text-gold"
          onClick={() => setRoll(Math.random())}
        >
          <RefreshCwIcon className="size-3.5" strokeWidth={1.5} />
          换一批
        </button>
      }
    >
      {movies.map(movie => (
        <PosterCard key={movie.id} movie={movie} className={posterClass} />
      ))}
    </Row>
  )
}

function pickTags(tags: LibraryFacet[], seed: number) {
  const common = tags.filter(tag => tag.count >= 5).slice(0, 12)
  if (common.length <= 2) return common.map(tag => tag.name)
  const first = Math.floor(seed * common.length)
  const second = (first + 1 + (Math.floor(seed * 7919) % (common.length - 1))) % common.length
  return [common[first]!.name, common[second]!.name]
}

function shuffle<T>(items: T[], seed: number) {
  let state = Math.floor(seed * 4294967296)
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

// Five recent movies take turns at the top of the page, a new five each
// visit. They change by themselves, by the bars or by a swipe.
function Hero({ movies }: { movies: LibraryMovie[] }) {
  const [seed] = useState(() => Math.random())
  const nsfwMode = useSettingsStore(state => state.nsfwMode)
  const picks = shuffle(
    movies.filter(movie => movie.cover),
    seed
  ).slice(0, heroCount)
  const [index, setIndex] = useState(0)
  const [touch, setTouch] = useState<number>()
  useEffect(() => {
    if (picks.length < 2) return
    const timer = setTimeout(() => setIndex(value => (value + 1) % picks.length), heroInterval)
    return () => clearTimeout(timer)
  }, [index, picks.length])

  const movie = picks[index] ?? picks[0]
  if (!movie) return <div className="h-4" />
  const step = (direction: number) =>
    setIndex(value => (value + direction + picks.length) % picks.length)
  const year = movie.release_date?.slice(0, 4)
  return (
    <section
      className="relative isolate -mt-[60px] flex min-h-[470px] items-end overflow-hidden bg-card md:min-h-[540px]"
      onTouchStart={event => setTouch(event.touches[0]?.clientX)}
      onTouchEnd={event => {
        const moved = (event.changedTouches[0]?.clientX ?? 0) - (touch ?? 0)
        if (touch !== undefined && Math.abs(moved) > 50) step(moved < 0 ? 1 : -1)
        setTouch(undefined)
      }}
    >
      {!nsfwMode
        ? picks.map((pick, i) => (
            <img
              key={pick.id}
              src={imageURL(pick.cover!)}
              alt=""
              className={cn(
                'absolute inset-0 -z-10 size-full scale-[1.01] object-cover object-[70%_center] transition-opacity duration-1000 motion-reduce:transition-none sm:object-right',
                i === index ? 'opacity-100' : 'opacity-0'
              )}
            />
          ))
        : null}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.05)_0_1px,transparent_1px_3px)] opacity-25" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-linear-to-b from-background/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-t from-background from-2% via-background/55 via-36% to-transparent to-72%" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-background/85 from-0% via-background/35 via-38% to-transparent to-68%" />

      <div className={cn(contentClass, 'relative z-10 flex w-full items-end pb-16')}>
        <div key={movie.id} className="max-w-[680px] animate-in space-y-3 duration-700 fade-in">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-xs tracking-[0.02em] text-muted-foreground tabular-nums">
            <span className="text-foreground">{movie.code}</span>
            {year ? <span>{year}</span> : null}
            {movie.duration > 0 ? <span>{movie.duration} 分钟</span> : null}
            {movie.chinese ? <span>中字</span> : null}
            {movie.rating > 0 ? (
              <span className="text-foreground">★ {movie.rating.toFixed(1)}</span>
            ) : null}
          </p>
          <h1 className="line-clamp-2 font-serif text-[36px] leading-[1.06] font-bold tracking-[-0.03em] sm:text-[clamp(38px,5.2vw,66px)]">
            {movie.title || movie.code}
          </h1>
          {movie.actors.length ? (
            <p className="truncate text-xs tracking-[0.03em] text-muted-foreground">
              {movie.actors
                .map(actor => actor.name)
                .slice(0, 3)
                .join('　')}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2.5 pt-3">
            <Button asChild size="lg" className="h-10 rounded-full px-5 text-sm">
              <Link to="/play/$id" params={{ id: String(movie.id) }}>
                <PlayIcon data-icon="inline-start" className="size-3.5 fill-current" />
                播放
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-10 rounded-full border-foreground/25 bg-card/30 px-4 text-sm backdrop-blur-sm"
            >
              <Link to="/movie/$id" params={{ id: String(movie.id) }}>
                详情
              </Link>
            </Button>
            <CollectionButton movieId={movie.id} look="icon" />
          </div>
        </div>
      </div>

      {picks.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 md:bottom-[58px]">
          <div className={cn(contentClass, 'flex justify-end')}>
            <div className="pointer-events-auto flex flex-col items-end gap-1.5">
              <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground tabular-nums">
                <span className="text-foreground">{String(index + 1).padStart(2, '0')}</span>
                {' / '}
                {String(picks.length).padStart(2, '0')}
              </p>
              <div className="flex gap-[5px]">
                {picks.map((pick, i) => (
                  <button
                    key={pick.id}
                    type="button"
                    aria-label={`第 ${i + 1} 部：${pick.code}`}
                    aria-current={i === index ? 'true' : undefined}
                    className="flex h-8 items-center"
                    onClick={() => setIndex(i)}
                  >
                    <span
                      className={cn(
                        'block h-0.5 rounded-full transition-all duration-300 motion-reduce:transition-none',
                        i === index ? 'w-[30px] bg-gold' : 'w-[18px] bg-foreground/25'
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

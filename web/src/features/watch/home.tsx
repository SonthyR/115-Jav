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
import { MovieCover } from '@/components/movie/movie-cover'
import { Button } from '@/components/ui/button'
import { CollectionButton } from '@/features/collections/collection-button'
import { cn } from 'cn'
import { ActorTile } from './actor-tile'
import { ContinueWatching } from './continue-watching'
import { PosterCard } from './poster-card'
import { Row } from './row'

const posterClass = 'w-32 shrink-0 snap-start sm:w-44'
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

  return (
    <main className="pb-24">
      <Hero movies={movies} />
      <div className="mx-auto max-w-6xl space-y-14 px-4 pt-6 sm:space-y-16">
        <ContinueWatching />

        {movies.length > 0 ? (
          <Row title="最近入库" link={{ to: '/browse' }}>
            {movies.map(movie => (
              <PosterCard key={movie.id} movie={movie} className={posterClass} />
            ))}
          </Row>
        ) : recent.data ? (
          <EmptyState className="py-12" title="媒体库里还没有影片" />
        ) : null}

        {facets.data?.actors.length ? (
          <Row title="演员" link={{ to: '/actors' }}>
            {facets.data.actors.slice(0, 20).map(actor => (
              <ActorTile
                key={actor.name}
                actor={actor}
                className="w-22 shrink-0 snap-start sm:w-26"
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
                className="group w-48 shrink-0 snap-start space-y-3 outline-ring sm:w-60"
              >
                <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted transition group-hover:brightness-110">
                  {item.cover ? (
                    <div className="absolute inset-0">
                      <MovieCover source={item.cover} width={720} />
                    </div>
                  ) : (
                    <BookmarkIcon className="size-7 text-muted-foreground" strokeWidth={1.5} />
                  )}
                </div>
                <p className="truncate text-sm">
                  {item.name}{' '}
                  <span className="text-xs text-muted-foreground">· {item.count} 部</span>
                </p>
              </Link>
            ))}
          </Row>
        ) : null}
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
          className="flex items-center gap-1.5 text-[13px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
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
      className="relative isolate -mt-16 h-[72vh] min-h-[30rem] overflow-hidden sm:h-[82vh]"
      onTouchStart={event => setTouch(event.touches[0]?.clientX)}
      onTouchEnd={event => {
        const moved = (event.changedTouches[0]?.clientX ?? 0) - (touch ?? 0)
        if (touch !== undefined && Math.abs(moved) > 50) step(moved < 0 ? 1 : -1)
        setTouch(undefined)
      }}
    >
      {picks.map((pick, i) => (
        <img
          key={pick.id}
          src={imageURL(pick.cover!)}
          alt=""
          className={cn(
            'absolute inset-0 -z-10 size-full object-cover object-right transition-opacity duration-1000',
            i === index ? 'opacity-100' : 'opacity-0'
          )}
        />
      ))}
      <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-linear-to-b from-background/80 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-linear-to-t from-background via-background/30 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-background/90 via-background/40 to-transparent" />
      <div className="mx-auto flex h-full max-w-6xl flex-wrap content-end items-end justify-between gap-6 px-4 pb-10 sm:pb-16">
        <div key={movie.id} className="max-w-xl animate-in space-y-5 duration-700 fade-in">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] tracking-wider text-muted-foreground">
            <span>{movie.code}</span>
            {year ? <span>{year}</span> : null}
            {movie.duration > 0 ? <span>{movie.duration} 分钟</span> : null}
            {movie.chinese ? <span>中字</span> : null}
            {movie.rating > 0 ? (
              <span className="text-foreground">★ {movie.rating.toFixed(1)}</span>
            ) : null}
          </p>
          <h1 className="line-clamp-2 font-serif text-3xl leading-tight font-semibold tracking-wide sm:text-5xl lg:text-6xl">
            {movie.title || movie.code}
          </h1>
          {movie.actors.length ? (
            <p className="truncate text-[15px] tracking-wide text-muted-foreground">
              {movie.actors
                .map(actor => actor.name)
                .slice(0, 3)
                .join('　')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg" className="h-12 rounded-full px-8 tracking-wide">
              <Link to="/play/$id" params={{ id: String(movie.id) }}>
                <PlayIcon data-icon="inline-start" className="fill-current" />
                播放
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full px-7 tracking-wide"
            >
              <Link to="/movie/$id" params={{ id: String(movie.id) }}>
                详情
              </Link>
            </Button>
            <CollectionButton movieId={movie.id} look="icon" />
          </div>
        </div>
        {picks.length > 1 ? (
          <div className="flex items-center gap-3 text-xs tracking-widest text-muted-foreground tabular-nums">
            <span className="text-foreground">{String(index + 1).padStart(2, '0')}</span>
            <div className="flex">
              {picks.map((pick, i) => (
                <button
                  key={pick.id}
                  type="button"
                  aria-label={`第 ${i + 1} 部：${pick.code}`}
                  className="flex h-6 items-center px-0.5"
                  onClick={() => setIndex(i)}
                >
                  <span
                    className={cn(
                      'block h-0.5 transition-all duration-500',
                      i === index ? 'w-9 bg-gold' : 'w-4 bg-foreground/25'
                    )}
                  />
                </button>
              ))}
            </div>
            <span>{String(picks.length).padStart(2, '0')}</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}

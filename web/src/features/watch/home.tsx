import { Link } from '@tanstack/react-router'
import { FolderHeartIcon, InfoIcon, PlayIcon, ShuffleIcon } from 'lucide-react'
import { useState } from 'react'

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
import { ActorTile } from './actor-tile'
import { ContinueWatching } from './continue-watching'
import { PosterCard } from './poster-card'
import { Row } from './row'

const posterClass = 'w-32 shrink-0 snap-start sm:w-40'

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
      <div className="mx-auto max-w-6xl space-y-8 px-4 pt-6">
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
                className="w-24 shrink-0 snap-start sm:w-28"
              />
            ))}
          </Row>
        ) : null}

        <MovieRow title="中文字幕" filter={{ chinese: true }} />
        <RandomRow total={recent.data?.total ?? 0} />
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
                className="w-48 shrink-0 snap-start space-y-2 outline-ring sm:w-56"
              >
                <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {item.cover ? (
                    <div className="absolute inset-0">
                      <MovieCover source={item.cover} />
                    </div>
                  ) : (
                    <FolderHeartIcon className="size-8 text-muted-foreground" />
                  )}
                </div>
                <p className="truncate text-sm font-medium">
                  {item.name} <span className="text-muted-foreground">· {item.count}</span>
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

// A random page of the library, so older films come back into view.
function RandomRow({ total }: { total: number }) {
  const pages = Math.ceil(total / LIBRARY_PAGE_SIZE)
  const [roll, setRoll] = useState(() => Math.random())
  // Page 1 is already the 最近入库 row.
  const page = pages < 2 ? 1 : 2 + Math.floor(roll * (pages - 1))
  const result = useLibraryMovies(page, {})
  if (pages < 2 || !result.data?.movies.length) return null
  const movies = shuffle(result.data.movies, roll)
  return (
    <Row
      title="随便看看"
      action={
        <Button variant="ghost" size="sm" onClick={() => setRoll(Math.random())}>
          <ShuffleIcon data-icon="inline-start" />
          换一批
        </Button>
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

// One recent movie fills the top of the page, picked anew on each visit.
function Hero({ movies }: { movies: LibraryMovie[] }) {
  const [pick] = useState(() => Math.random())
  const candidates = movies.filter(movie => movie.cover)
  const movie = candidates[Math.floor(pick * candidates.length)]
  if (!movie?.cover) return <div className="h-4" />
  const year = movie.release_date?.slice(0, 4)
  return (
    <section className="relative isolate h-[56vh] min-h-80 overflow-hidden sm:h-[62vh]">
      <img
        src={imageURL(movie.cover)}
        alt=""
        className="absolute inset-0 -z-10 size-full object-cover object-right"
      />
      <div className="absolute inset-0 -z-10 bg-linear-to-t from-background via-background/40 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-background/85 via-background/30 to-transparent" />
      <div className="mx-auto flex h-full max-w-6xl flex-col justify-end gap-3 px-4 pb-8">
        <p className="text-sm font-medium text-muted-foreground">
          {movie.code}
          {year ? ` · ${year}` : ''}
          {movie.actors.length
            ? ` · ${movie.actors
                .map(actor => actor.name)
                .slice(0, 3)
                .join('、')}`
            : ''}
        </p>
        <h1 className="line-clamp-2 max-w-2xl text-2xl leading-tight font-bold sm:text-4xl">
          {movie.title || movie.code}
        </h1>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link to="/play/$id" params={{ id: String(movie.id) }}>
              <PlayIcon data-icon="inline-start" className="fill-current" />
              播放
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="rounded-full">
            <Link to="/movie/$id" params={{ id: String(movie.id) }}>
              <InfoIcon data-icon="inline-start" />
              详情
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

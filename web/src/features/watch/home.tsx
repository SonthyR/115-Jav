import { Link } from '@tanstack/react-router'
import { FolderHeartIcon, InfoIcon, PlayIcon } from 'lucide-react'
import { useState } from 'react'

import { imageURL } from '@/api/client'
import { useCollections } from '@/api/collections'
import { type LibraryMovie, useLibraryMovies } from '@/api/library'
import { EmptyState } from '@/components/empty-state'
import { MovieCover } from '@/components/movie/movie-cover'
import { Button } from '@/components/ui/button'
import { ContinueWatching } from './continue-watching'
import { PosterCard } from './poster-card'
import { Row } from './row'

export function WatchHome() {
  const recent = useLibraryMovies(1, {})
  const rated = useLibraryMovies(1, { sort: 'rating' })
  const collections = useCollections()
  const movies = recent.data?.movies ?? []

  return (
    <main className="pb-24">
      <Hero movies={movies} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 pt-6">
        <ContinueWatching />

        {movies.length > 0 ? (
          <Row title="最近入库" to="/browse">
            {movies.map(movie => (
              <PosterCard
                key={movie.id}
                movie={movie}
                className="w-32 shrink-0 snap-start sm:w-40"
              />
            ))}
          </Row>
        ) : recent.data ? (
          <EmptyState className="py-12" title="媒体库里还没有影片" />
        ) : null}

        {rated.data?.movies.length ? (
          <Row title="高分影片" to="/browse">
            {rated.data.movies.map(movie => (
              <PosterCard
                key={movie.id}
                movie={movie}
                className="w-32 shrink-0 snap-start sm:w-40"
              />
            ))}
          </Row>
        ) : null}

        {collections.data?.length ? (
          <Row title="收藏夹" to="/collections">
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

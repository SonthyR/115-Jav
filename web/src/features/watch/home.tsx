import { Link } from '@tanstack/react-router'
import { ChevronRightIcon, FolderHeartIcon, LayoutGridIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useCollections } from '@/api/collections'
import { useLibraryMovies } from '@/api/library'
import { AppPage } from '@/components/app-page'
import { EmptyState } from '@/components/empty-state'
import { MovieCover } from '@/components/movie/movie-cover'
import { Button } from '@/components/ui/button'
import { ContinueWatching } from './continue-watching'
import { WatchMovieCard } from './movie-card'

export function WatchHome() {
  const recent = useLibraryMovies(1, {})
  const collections = useCollections()
  return (
    <AppPage>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-bold">看片</h1>
        <Button asChild variant="secondary">
          <Link to="/wall">
            <LayoutGridIcon data-icon="inline-start" />
            海报墙
          </Link>
        </Button>
      </header>

      <ContinueWatching />

      <Row title="最近入库" to="/browse">
        {recent.data?.movies.map(movie => (
          <WatchMovieCard
            key={movie.id}
            movie={movie}
            className="w-56 shrink-0 snap-start rounded-2xl outline-ring sm:w-64"
          />
        ))}
      </Row>
      {recent.data?.movies.length === 0 ? (
        <EmptyState className="py-12" title="媒体库里还没有影片" />
      ) : null}

      {collections.data?.length ? (
        <Row title="收藏夹" to="/collections">
          {collections.data.map(item => (
            <Link
              key={item.id}
              to="/collections/$id"
              params={{ id: String(item.id) }}
              className="w-44 shrink-0 snap-start space-y-2 rounded-2xl outline-ring sm:w-52"
            >
              <div className="relative flex aspect-3/2 items-center justify-center overflow-hidden rounded-xl bg-muted">
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
    </AppPage>
  )
}

function Row({
  title,
  to,
  children
}: {
  title: string
  to: '/browse' | '/collections'
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <Link
          to={to}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          全部
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">{children}</div>
    </section>
  )
}

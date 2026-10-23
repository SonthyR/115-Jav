import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'

import { imageURL } from '@/api/client'
import { useLibraryMovie } from '@/api/library'
import { usePlayInfo } from '@/api/playback'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { CollectionButton } from '@/features/collections/collection-button'
import { MovieStats } from '@/features/movie-detail/hero'
import { MovieMetadata } from '@/features/movie-detail/metadata'
import { MoviePreviews } from '@/features/movie-detail/previews'
import { MovieDetailSkeleton } from '@/features/movie-detail/skeleton'
import { formatTime } from '@/features/player/player'
import { formatSize } from '@/lib/format'

// The movie page leads with the backdrop and one play button; versions and
// parts sit right below it instead of in a menu.
export function WatchMoviePage({ id }: { id: number }) {
  const router = useRouter()
  const detail = useLibraryMovie(id)
  const play = usePlayInfo(id)
  if (detail.isPending) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <MovieDetailSkeleton />
      </div>
    )
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

  return (
    <div className="pb-24">
      <section className="relative isolate overflow-hidden">
        {movie.cover ? (
          <img
            src={imageURL(movie.cover)}
            alt=""
            className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-40 blur-2xl"
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-background/30 via-background/70 to-background" />
        <div className="mx-auto max-w-6xl px-4 pt-4 pb-8 sm:pt-6">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 -ml-2"
            onClick={() =>
              window.history.length > 1 ? router.history.back() : router.navigate({ to: '/' })
            }
          >
            <ArrowLeftIcon data-icon="inline-start" />
            返回
          </Button>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
            <Link
              to="/play/$id"
              params={{ id: String(id) }}
              className="group relative block aspect-3/2 overflow-hidden rounded-2xl bg-muted shadow-2xl ring-1 ring-foreground/10"
              aria-label="播放"
            >
              {movie.cover ? (
                <img
                  src={imageURL(movie.cover)}
                  alt={movie.code}
                  className="size-full object-cover"
                />
              ) : null}
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                <span className="flex size-16 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur transition-transform group-hover:scale-110">
                  <PlayIcon className="size-8 translate-x-0.5 fill-current" />
                </span>
              </span>
              {resumable ? (
                <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                  <span
                    className="block h-full bg-primary"
                    style={{
                      width: `${Math.min(100, (progress.position / progress.duration) * 100)}%`
                    }}
                  />
                </span>
              ) : null}
            </Link>

            <div className="min-w-0 space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground tabular-nums">
                  {movie.code}
                </p>
                <h1 className="text-2xl leading-snug font-bold sm:text-3xl">
                  {movie.title || movie.code}
                </h1>
                {movie.origin_title && movie.origin_title !== movie.title ? (
                  <p className="text-sm leading-6 text-muted-foreground">{movie.origin_title}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full px-6"
                  disabled={files.length === 0}
                >
                  <Link to="/play/$id" params={{ id: String(id) }}>
                    <PlayIcon data-icon="inline-start" className="fill-current" />
                    {resumable ? `继续播放 ${formatTime(progress.position)}` : '播放'}
                  </Link>
                </Button>
                {resumable ? (
                  <Button asChild size="lg" variant="secondary" className="rounded-full">
                    <Link
                      to="/play/$id"
                      params={{ id: String(id) }}
                      search={{ file: files[0]?.file_id, restart: true }}
                    >
                      <RotateCcwIcon data-icon="inline-start" />
                      从头播放
                    </Link>
                  </Button>
                ) : null}
                <CollectionButton movieId={id} />
              </div>

              <MovieStats movie={movie} />
              <MovieMetadata movie={movie} library />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-4">
        {files.length > 1 ? (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">版本和分卷</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {files.map((file, index) => (
                <Link
                  key={file.file_id}
                  to="/play/$id"
                  params={{ id: String(id) }}
                  search={{ file: file.file_id }}
                  className="flex items-center gap-3 rounded-xl bg-muted/60 p-3 ring-1 ring-border transition-colors hover:bg-muted"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background">
                    <PlayIcon className="size-4 translate-x-px fill-current" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{file.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatSize(file.size)}
                      {index === resumeFile && resumable
                        ? ` · 看到 ${formatTime(progress.position)}`
                        : ''}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        {play.data && files.length === 0 ? (
          <p className="text-sm text-muted-foreground">这部影片没有可播放的 115 视频。</p>
        ) : null}
        <MoviePreviews images={movie.preview_images} />
      </div>
    </div>
  )
}

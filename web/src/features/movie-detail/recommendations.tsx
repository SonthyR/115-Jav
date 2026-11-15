import { useCallback, useEffect, useRef, useState } from 'react'

import { type MovieReference, useRecommendationMovie } from '@/api/discover'
import { MovieCard, MovieCardSkeleton } from '@/components/movie'
import { MovieResourceBadges, MovieStateBadge } from '@/components/movie/movie-badges'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'
import { useSettingsStore } from '@/stores/settings'
import { MovieDetailTrigger } from './detail-trigger'
import { observeRecommendation } from './recommendation-visibility'

export function MovieRecommendations({
  title,
  movies
}: {
  title: string
  movies: MovieReference[]
}) {
  const visible = movies.slice(0, 8)

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium tracking-[0.08em]">{title}</h2>
        <span className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
          {visible.length} 部
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无相关影片</p>
      ) : (
        <div className="-mx-1 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-1 pb-2 [&::-webkit-scrollbar]:hidden">
          {visible.map(movie => (
            <div key={movie.id} className="w-52 shrink-0 snap-start sm:w-60">
              <RecommendationCard movie={movie} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function RecommendationCard({ movie }: { movie: MovieReference }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [readyCover, setReadyCover] = useState<string>()
  const nsfwMode = useSettingsStore(state => state.nsfwMode)
  const detail = useRecommendationMovie(movie.id)
  const { request, prioritize } = detail
  const data = detail.movie
  const failed = detail.isError && !detail.isFetching
  const cover = data || failed ? data?.cover || data?.thumbnail || movie.thumbnail : ''
  const coverKey = JSON.stringify([cover, nsfwMode])
  const loading = (!data && !failed) || readyCover !== coverKey
  const onCoverReady = useCallback(() => setReadyCover(coverKey), [coverKey])

  useEffect(() => {
    if (cardRef.current) return observeRecommendation(cardRef.current, request)
  }, [request])

  return (
    <div ref={cardRef} className="relative h-full min-w-0">
      <MovieDetailTrigger
        movie={{ id: movie.id }}
        className="relative block h-full rounded-xl outline-ring focus-visible:ring-2 focus-visible:ring-ring"
        onFocus={() => {
          if (!data && !failed) prioritize()
        }}
        onClick={prioritize}
      >
        <div className={cn('h-full overflow-hidden rounded-xl', loading && 'invisible')}>
          <MovieCard
            movie={{
              code: data?.code ?? movie.code,
              title: data?.title ?? '',
              cover
            }}
            coverLoading="eager"
            onCoverReady={onCoverReady}
            description={
              data ? data.release_date || '\u00a0' : failed ? '详情暂时无法加载' : '\u00a0'
            }
            state={<MovieStateBadge movie={movie} />}
          >
            <div className="flex min-h-5 flex-wrap gap-1.5">
              {data ? <MovieResourceBadges movie={data} /> : null}
            </div>
          </MovieCard>
        </div>
        {loading ? (
          <div className="absolute inset-0">
            <MovieCardSkeleton />
          </div>
        ) : null}
      </MovieDetailTrigger>
      {!data && failed ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="absolute right-3 bottom-2"
          onClick={prioritize}
        >
          重试
        </Button>
      ) : null}
    </div>
  )
}

import { Link } from '@tanstack/react-router'
import { ChevronRightIcon, RefreshCwIcon, ShuffleIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { describeApiError } from '@/api/client'
import {
  type RecommendSection,
  type TasteItem,
  useRecommendations,
  useRefreshRecommendations
} from '@/api/recommend'
import { AppPage } from '@/components/app-page'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { MovieGridSkeleton } from '@/components/movie'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MovieGrid } from '@/features/discover/movie-grid'

// The picks row shows this many at a time; 12 fills grids of 2, 3 or 4.
const PICKS_SHOWN = 12

// Films the library lacks, chosen from the actresses, tags, makers and series
// it leans on; a card's download button sends one to offline download.
export function RecommendPage() {
  const recommendations = useRecommendations()
  const refresh = useRefreshRecommendations()
  const data = recommendations.data
  const busy = recommendations.isFetching || refresh.isPending
  return (
    <AppPage>
      <PageHeader
        title="推荐"
        description="按你片库里的演员、标签、厂牌和系列挑的，收藏和看过的片子分量更重。都是还没入库的，点卡片右上角直接离线"
      >
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            refresh.mutate(undefined, {
              onError: error => toast.error(describeApiError(error))
            })
          }
        >
          <RefreshCwIcon data-icon="inline-start" className={busy ? 'animate-spin' : undefined} />
          重新分析
        </Button>
      </PageHeader>
      {recommendations.isPending || (refresh.isPending && !data) ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            正在分析你的片库并从 JavDB 挑片，第一次大约要半分钟…
          </p>
          <MovieGridSkeleton count={PICKS_SHOWN} />
        </div>
      ) : recommendations.isError && !data ? (
        <ErrorState
          message={`推荐加载失败：${describeApiError(recommendations.error)}。请检查网络或代理设置`}
          onRetry={() => void recommendations.refetch()}
          retrying={recommendations.isFetching}
        />
      ) : data && data.sections.length > 0 ? (
        <div className="flex flex-col gap-10">
          <TasteSummary actors={data.taste.actors} tags={data.taste.tags} />
          {data.sections.map(section => (
            <SectionRow key={`${section.kind}:${section.id ?? ''}`} section={section} />
          ))}
          <p className="text-center text-xs text-muted-foreground">
            分析于 {new Date(data.generated_at).toLocaleString()}，每 6 小时更新一次
          </p>
        </div>
      ) : (
        <EmptyState title="片库里还没有能分析的影片，刮削过 JavDB 资料的片子多了再来看看" />
      )}
    </AppPage>
  )
}

function TasteSummary({ actors, tags }: { actors: TasteItem[]; tags: TasteItem[] }) {
  if (actors.length === 0 && tags.length === 0) return null
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-muted p-4 ring-1 ring-border dark:bg-card/60 dark:ring-0">
      {actors.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">你偏爱的演员</span>
          {actors.slice(0, 8).map(actor => (
            <Badge key={actor.id} variant="secondary" asChild>
              <Link to="/browse/$kind/$name" params={{ kind: 'actor', name: actor.name }}>
                {actor.name}
              </Link>
            </Badge>
          ))}
        </div>
      ) : null}
      {tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">常看的标签</span>
          {tags.slice(0, 8).map(tag => (
            <Badge key={tag.id} variant="outline">
              {tag.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function SectionRow({ section }: { section: RecommendSection }) {
  const [round, setRound] = useState(0)
  const picks = section.kind === 'picks'
  const rounds = picks ? Math.ceil(section.movies.length / PICKS_SHOWN) : 1
  const start = (round % rounds) * PICKS_SHOWN
  const movies = picks ? section.movies.slice(start, start + PICKS_SHOWN) : section.movies
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold break-words">{section.title}</h2>
          <p className="text-sm text-muted-foreground">{section.reason}</p>
        </div>
        {picks && rounds > 1 ? (
          <Button variant="ghost" size="sm" onClick={() => setRound(round + 1)}>
            <ShuffleIcon data-icon="inline-start" />
            换一批
          </Button>
        ) : (
          <SectionLink section={section} />
        )}
      </div>
      <MovieGrid movies={movies} />
    </section>
  )
}

// More of a row: the actress's JavDB works on her page, the rest on the
// discover pages.
function SectionLink({ section }: { section: RecommendSection }) {
  if (!section.id || !section.name) return null
  const label = (
    <>
      更多
      <ChevronRightIcon data-icon="inline-end" />
    </>
  )
  if (section.kind === 'actor') {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link
          to="/browse/$kind/$name"
          params={{ kind: 'actor', name: section.name }}
          search={{ source: 'javdb' }}
        >
          {label}
        </Link>
      </Button>
    )
  }
  if (section.kind === 'picks') return null
  const target =
    section.kind === 'tag'
      ? { kind: 'tag' as const, zone: 'censored' as const }
      : { kind: section.kind }
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link
        to="/discover/search"
        search={{ ...target, id: section.id, name: section.name, page: 1, main: '' }}
      >
        {label}
      </Link>
    </Button>
  )
}

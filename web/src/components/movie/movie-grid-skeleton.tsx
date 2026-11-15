import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from 'cn'
import { MovieGridLayout } from './movie-grid-layout'

export function MovieGridSkeleton({
  count = 8,
  compact = false,
  poster = false
}: {
  count?: number
  compact?: boolean
  poster?: boolean
}) {
  return (
    <MovieGridLayout>
      {Array.from({ length: count }, (_, index) => (
        <MovieCardSkeleton key={index} compact={compact} poster={poster} />
      ))}
    </MovieGridLayout>
  )
}

export function MovieCardSkeleton({
  compact = false,
  poster = false
}: {
  compact?: boolean
  poster?: boolean
}) {
  return (
    <Card size="sm" className="h-full gap-0 overflow-hidden rounded-[9px] py-0">
      <Skeleton
        className={cn('w-full rounded-none bg-muted', poster ? 'aspect-2/3' : 'aspect-3/2')}
      />
      <CardContent className={cn('space-y-2', poster ? 'px-0.5 pt-2.5 pb-1' : 'p-3')}>
        <Skeleton className="h-5 w-full" />
        {compact ? null : <Skeleton className="h-4 w-3/4" />}
        <Skeleton className="h-5 w-1/2" />
      </CardContent>
    </Card>
  )
}

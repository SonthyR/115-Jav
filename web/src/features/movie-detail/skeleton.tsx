import { Skeleton } from '@/components/ui/skeleton'
import { MovieGridSkeleton } from '@/components/movie'
import { cn } from 'cn'

export function MovieDetailSkeleton({ page = false }: { page?: boolean }) {
  return (
    <div className={cn(page ? 'pb-24' : 'space-y-8')} aria-busy="true">
      <section
        className={cn(
          'relative overflow-hidden bg-muted/35 motion-reduce:animate-none',
          page
            ? '-mt-[60px] min-h-[31rem] sm:min-h-[36rem]'
            : 'min-h-[17rem] rounded-xl sm:min-h-[21rem]'
        )}
      >
        <Skeleton className="absolute inset-0 rounded-none bg-muted/50" />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-r from-background/60 via-transparent to-transparent" />
        <div
          className={cn(
            'relative flex min-h-[17rem] items-end pb-8',
            page
              ? 'min-h-[31rem] px-5 sm:min-h-[36rem] md:px-12'
              : 'min-h-[17rem] px-5 sm:min-h-[21rem] sm:px-6'
          )}
        >
          <div className="mx-auto w-full max-w-[1200px] space-y-3">
            <Skeleton className="h-3 w-40 max-w-full" />
            <Skeleton className="h-9 w-4/5 max-w-xl sm:h-14" />
            <Skeleton className="h-9 w-2/3 max-w-lg sm:h-14" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </div>
      </section>

      <div
        className={cn(
          'grid items-start gap-8',
          page
            ? 'mx-auto w-full max-w-[1200px] px-5 md:px-12 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)] lg:gap-12'
            : 'lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)] lg:gap-12'
        )}
      >
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="space-y-2 pt-1">
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-4 w-11/12 max-w-xl" />
            <Skeleton className="h-4 w-2/3 max-w-md" />
          </div>
          <div className="flex flex-wrap gap-2.5 pt-2">
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="size-10 rounded-full" />
          </div>
          <div className="space-y-3 pt-6">
            <Skeleton className="h-3 w-16" />
            <div className="flex flex-wrap gap-4">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-2.5 w-14" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="divide-y divide-border/60 border-y border-border/60">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 py-3">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ))}
          </div>
          <MovieMagnetsSkeleton />
        </div>
      </div>

      <div className={cn('space-y-4', page && 'mx-auto w-full max-w-[1200px] px-5 md:px-12')}>
        <Skeleton className="h-4 w-20" />
        <div className="-mx-1 flex gap-3 overflow-hidden px-1">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="aspect-video w-40 shrink-0 rounded-lg sm:w-52" />
          ))}
        </div>
      </div>
      <div className={cn('space-y-4', page && 'mx-auto w-full max-w-[1200px] px-5 md:px-12')}>
        <Skeleton className="h-4 w-28" />
        <MovieGridSkeleton count={8} />
      </div>
    </div>
  )
}

export function MovieMagnetsSkeleton() {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="border-y border-border/60">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/60"
          >
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

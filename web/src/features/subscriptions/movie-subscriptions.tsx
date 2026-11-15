import { BellOffIcon } from 'lucide-react'

import type { SubscriptionItem } from '@/api/subscriptions'
import { ErrorState } from '@/components/error-state'
import { MovieCardSkeleton } from '@/components/movie'
import { SubscriptionCard } from './subscription-card'
import { isPendingSubscription } from './subscription-status'

const gridClass =
  'grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-9'

export type MovieSubscriptionsProps = {
  items: SubscriptionItem[]
  isPending: boolean
  isError: boolean
  isFetching: boolean
  onRetry: () => void
  emptyTitle: string
  selecting?: boolean
  selected?: Set<number>
  onSelect?: (id: number) => void
  disabled?: boolean
}

export function MovieSubscriptions({
  items,
  isPending,
  isError,
  isFetching,
  onRetry,
  emptyTitle,
  selecting = false,
  selected = new Set(),
  onSelect,
  disabled = false
}: MovieSubscriptionsProps) {
  if (isPending) {
    return (
      <div className={gridClass} aria-busy="true">
        {Array.from({ length: 8 }, (_, index) => (
          <MovieCardSkeleton key={index} />
        ))}
      </div>
    )
  }
  if (isError) {
    return <ErrorState message="订阅列表加载失败" onRetry={onRetry} retrying={isFetching} />
  }
  if (items.length === 0) {
    return <SubscriptionEmptyState title={emptyTitle} />
  }
  return (
    <div className={gridClass}>
      {items.map(item => (
        <SubscriptionCard
          key={item.id}
          item={item}
          selecting={selecting}
          selected={selecting && selected.has(item.id)}
          disabled={disabled || (selecting && !isPendingSubscription(item))}
          onSelect={() => onSelect?.(item.id)}
        />
      ))}
    </div>
  )
}

export function SubscriptionEmptyState({
  title,
  description
}: {
  title: string
  description?: string
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-border bg-card/35 px-6 text-center">
      <span className="grid size-11 place-items-center rounded-full border border-border bg-card text-muted-foreground">
        <BellOffIcon className="size-4" strokeWidth={1.5} />
      </span>
      <p className="font-mono text-[10px] tracking-[0.16em] text-gold uppercase">Nothing waiting</p>
      <p className="max-w-md text-sm leading-6 text-muted-foreground">{title}</p>
      {description ? (
        <p className="max-w-md text-xs leading-5 text-muted-foreground/75">{description}</p>
      ) : null}
    </div>
  )
}

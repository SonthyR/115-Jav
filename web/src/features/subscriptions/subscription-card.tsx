import { LoaderCircleIcon, Trash2Icon } from 'lucide-react'

import { type SubscriptionItem, useRemoveSubscription } from '@/api/subscriptions'
import { MovieCard } from '@/components/movie'
import { MovieStateBadge } from '@/components/movie/movie-badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MovieDetailTrigger } from '@/features/movie-detail/detail-trigger'
import { cn } from 'cn'

const dateTimeFormat = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

const statusLabels: Record<SubscriptionItem['status'], string> = {
  waiting: '等待磁力',
  added: '已加入 115',
  stale: '长期无源',
  active: '生效中',
  paused: '已暂停'
}

// Keep the card mounted when switching between browsing and selection.
export function SubscriptionCard({
  item,
  selecting,
  selected,
  disabled,
  onSelect
}: {
  item: SubscriptionItem
  selecting: boolean
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const remove = useRemoveSubscription()
  const busy = disabled || remove.isPending

  const card = (
    <MovieCard
      movie={item}
      description={
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.03em] tabular-nums">
            <span>{item.release_date ? `发行 ${item.release_date}` : '发行日期未知'}</span>
            <span>{item.code}</span>
          </div>
          <p className="text-xs leading-4 text-muted-foreground">{describeSchedule(item)}</p>
          {item.error ? (
            <p className="line-clamp-2 text-destructive" title={item.error}>
              {item.error}
            </p>
          ) : null}
        </div>
      }
      state={
        <>
          <MovieStateBadge movie={{ id: item.target_id, code: item.code }} hideViewed />
          <Badge variant={statusVariant(item.status)} className="gap-1">
            <span className="size-1 rounded-full bg-current opacity-70" />
            {statusLabels[item.status]}
          </Badge>
        </>
      }
      coverOverlay={
        !selecting ? (
          <div className="absolute top-2 right-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  className="size-9 rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 hover:text-white"
                  onClick={event => {
                    event.preventDefault()
                    event.stopPropagation()
                    remove.mutate(item)
                  }}
                >
                  {remove.isPending ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <Trash2Icon />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">取消订阅</TooltipContent>
            </Tooltip>
          </div>
        ) : undefined
      }
    />
  )

  return (
    <div className="relative h-full min-w-0">
      <MovieDetailTrigger
        movie={{ id: item.target_id }}
        className={cn(
          'block h-full rounded-[9px] outline-ring focus-visible:outline-2 focus-visible:outline-offset-4',
          selected && 'ring-2 ring-gold',
          selecting && disabled && 'cursor-not-allowed opacity-50'
        )}
        role={selecting ? 'checkbox' : undefined}
        disabled={selecting && disabled}
        onClick={event => {
          if (!selecting) return
          event.preventDefault()
          onSelect()
        }}
      >
        {card}
      </MovieDetailTrigger>
      {selecting ? (
        <Checkbox
          checked={selected}
          disabled={disabled}
          onCheckedChange={onSelect}
          className="absolute top-3 right-3 size-5 data-checked:border-gold data-checked:bg-gold data-checked:text-library-foreground"
        />
      ) : null}
    </div>
  )
}

function statusVariant(status: SubscriptionItem['status']) {
  if (status === 'added') return 'success' as const
  if (status === 'stale' || status === 'paused') return 'secondary' as const
  return 'default' as const
}

function describeSchedule(item: SubscriptionItem) {
  if (item.status === 'added') return '已自动加入 115'
  if (item.status === 'stale') return '发行 30 天后仍无磁力'
  if (item.hash && !item.auto_download) return '已有磁力，等待入库'
  if (item.next_check_at) {
    const next = new Date(item.next_check_at)
    if (next.getTime() <= Date.now()) return '即将检查'
    return `下次检查 ${dateTimeFormat.format(next)}`
  }
  return '等待检查'
}

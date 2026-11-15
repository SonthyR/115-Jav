import { BellPlusIcon, BellRingIcon, CircleCheckIcon, LoaderCircleIcon } from 'lucide-react'
import type { MouseEvent } from 'react'

import type { DiscoverMovie } from '@/api/discover'
import { useAddSubscription, useSubscription } from '@/api/subscriptions'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Shown on unreleased cards without a magnet; clicks must not open the detail dialog.
export function MovieSubscribeButton({
  movie,
  showLabel = false
}: {
  movie: DiscoverMovie
  showLabel?: boolean
}) {
  const { subscription, isPending } = useSubscription('movie', movie.id)
  const add = useAddSubscription()
  const waiting = subscription?.status === 'waiting'
  const added = subscription?.status === 'added'
  const canSubscribe = !waiting && !added
  const label = waiting
    ? '已订阅，将持续检查符合偏好的磁力'
    : added
      ? '已加入 115 离线下载'
      : subscription
        ? '重新订阅'
        : '订阅影片'

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!canSubscribe || add.isPending) return
    add.mutate({ kind: 'movie', target_id: movie.id })
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={canSubscribe ? 'outline' : 'default'}
          size={showLabel ? 'lg' : 'icon-sm'}
          aria-label={label}
          title={label}
          disabled={isPending || add.isPending}
          className={
            showLabel
              ? 'h-10 border-white/25 bg-white/10 px-4 text-xs text-white backdrop-blur hover:bg-white/20 hover:text-white'
              : canSubscribe
                ? 'size-10 bg-background/85 backdrop-blur sm:size-9'
                : 'size-10 sm:size-9'
          }
          onClick={handleClick}
        >
          {add.isPending ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : added ? (
            <CircleCheckIcon />
          ) : waiting ? (
            <BellRingIcon />
          ) : (
            <BellPlusIcon />
          )}
          {showLabel ? (waiting ? '已订阅' : added ? '已加入' : '订阅') : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

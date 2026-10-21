import { CloudDownloadIcon, LoaderCircleIcon } from 'lucide-react'
import type { MouseEvent } from 'react'

import { describeApiError } from '@/api/client'
import type { DiscoverMovie } from '@/api/discover'
import { useAddOffline } from '@/api/offline'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { notifyOfflineTask, notifyTaskError } from '@/features/tasks/task-toast'

// Shown on released cards with magnets; clicks must not open the detail dialog.
export function MovieOfflineButton({ movie }: { movie: DiscoverMovie }) {
  const add = useAddOffline(movie.id)

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (add.isPending) return
    add.mutate(undefined, {
      onSuccess: submission => notifyOfflineTask(submission),
      onError: error =>
        notifyTaskError(
          `offline:submit-error:${movie.id}`,
          `${movie.code} 加入 115 失败`,
          describeApiError(error)
        )
    })
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={add.isPending}
          className="bg-background/85 backdrop-blur"
          onClick={handleClick}
        >
          {add.isPending ? <LoaderCircleIcon className="animate-spin" /> : <CloudDownloadIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">按订阅偏好选磁力，一键加入 115</TooltipContent>
    </Tooltip>
  )
}

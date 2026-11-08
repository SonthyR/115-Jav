import { Link } from '@tanstack/react-router'
import {
  ArrowDownToLineIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  XIcon
} from 'lucide-react'
import { useContext } from 'react'

import {
  isOfflineTaskActive,
  type OfflineSubmission,
  useOfflineActivity,
  useOfflineControl
} from '@/api/offline'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { MovieDetailDialogContext } from '@/features/movie-detail/dialog-context'
import { downloadStatus } from '@/features/tasks/download-status'
import { cn } from 'cn'

// How many recent downloads the panel lists.
const shown = 12

// Offline downloads at a glance from any page: a count while any are running,
// and a panel with each one's progress through 115 and into the library.
export function DownloadIndicator() {
  const activity = useOfflineActivity()
  const tasks = activity.data?.tasks ?? []
  const active = tasks.filter(isOfflineTaskActive).length
  const failed = tasks.some(task => task.status === 'failed')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0 rounded-full"
          title="离线下载"
        >
          <ArrowDownToLineIcon className={cn(active > 0 && 'text-sky-500')} />
          {active > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] leading-4 font-semibold text-white">
              {active}
            </span>
          ) : failed ? (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-destructive" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-medium">离线下载</p>
          <Link to="/organize" className="text-sm text-muted-foreground hover:text-foreground">
            整理记录
          </Link>
        </div>
        {tasks.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {activity.isPending ? '读取中…' : '还没有离线下载，去「找片」挑一部吧'}
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {tasks.slice(0, shown).map(task => (
              <DownloadRow key={task.task_id} task={task} />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

function DownloadRow({ task }: { task: OfflineSubmission }) {
  const openMovie = useContext(MovieDetailDialogContext)
  const cancel = useOfflineControl('cancel')
  const active = isOfflineTaskActive(task)
  const body = (
    <>
      <div className="flex items-center gap-2">
        <StateIcon task={task} />
        <span className="font-medium">{task.code}</span>
        <span className="ml-auto text-xs text-muted-foreground">{stateLabel(task)}</span>
      </div>
      {task.phase === 'downloading' ? (
        <Progress value={task.progress} variant="info" className="mt-2 h-1.5" />
      ) : null}
      {task.error && !active ? (
        <p className="mt-1 line-clamp-2 text-xs text-destructive">{task.error}</p>
      ) : null}
    </>
  )
  const rowClass =
    'block min-w-0 flex-1 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60'
  return (
    <li className="flex items-stretch">
      {task.library_id ? (
        <Link to="/movie/$id" params={{ id: String(task.library_id) }} className={rowClass}>
          {body}
        </Link>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className={rowClass}
          onClick={event => openMovie?.({ id: task.javdb_id }, event.currentTarget)}
          onKeyDown={event => {
            if (event.key === 'Enter') openMovie?.({ id: task.javdb_id }, event.currentTarget)
          }}
        >
          {body}
        </div>
      )}
      {active && task.can_cancel ? (
        <Button
          variant="ghost"
          size="icon"
          className="my-auto mr-2 shrink-0 rounded-full"
          title="取消下载"
          disabled={cancel.isPending}
          onClick={() => {
            if (window.confirm(`取消 ${task.code} 的离线下载？`)) cancel.mutate(task.task_id)
          }}
        >
          <XIcon />
        </Button>
      ) : null}
    </li>
  )
}

function StateIcon({ task }: { task: OfflineSubmission }) {
  if (task.status === 'failed' || task.status === 'cancelled')
    return <CircleAlertIcon className="size-4 text-destructive" />
  if (isOfflineTaskActive(task))
    return <LoaderCircleIcon className="size-4 animate-spin text-sky-500" />
  return <CircleCheckIcon className="size-4 text-success" />
}

function stateLabel(task: OfflineSubmission) {
  if (task.status === 'cancelled') return '已取消'
  if (task.status === 'failed') return '失败'
  if (task.processing || task.phase === 'processing') return '整理入库中'
  if (task.phase === 'downloading') return `${downloadStatus(task)} ${Math.round(task.progress)}%`
  if (task.phase === 'in_library') return '已入库'
  return '已下载'
}

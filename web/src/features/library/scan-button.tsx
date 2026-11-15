import { LoaderCircleIcon, RotateCcwIcon, ScanLineIcon } from 'lucide-react'

import { describeApiError } from '@/api/client'
import { useStartLibraryScan } from '@/api/library'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { notifyTaskError, useNotifyScanTask } from '@/features/tasks/task-toast'

export function LibraryScanButton({
  loading,
  available,
  scanning,
  rebuilding,
  connected,
  onStarted
}: {
  loading: boolean
  available: boolean
  scanning: boolean
  rebuilding: boolean
  connected: boolean
  onStarted: () => void
}) {
  const startScan = useStartLibraryScan()
  const notifyScan = useNotifyScanTask()
  // Keep the mutation observer mounted while pagination replaces the visible control.
  if (loading) return <Skeleton className="h-10 w-24 rounded-4xl sm:h-9 sm:w-60" />
  if (!available) return null

  return (
    <div className="flex items-center gap-2">
      {[false, true].map(rebuild => {
        const active = scanning && rebuilding === rebuild
        const activityLabel = connected ? (rebuild ? '正在重建' : '正在同步') : '进度已断开'
        const label = active ? activityLabel : rebuild ? '重建媒体库' : '同步媒体库'
        const busy = active || (startScan.isPending && startScan.variables === rebuild)
        return (
          <Button
            key={String(rebuild)}
            variant={rebuild ? 'outline' : 'default'}
            aria-label={label}
            className="h-10 gap-1.5 px-3 text-xs tracking-wide sm:h-9"
            disabled={scanning || startScan.isPending}
            onClick={() =>
              startScan.mutate(rebuild, {
                onSuccess: task => {
                  notifyScan(task)
                  onStarted()
                },
                onError: error => {
                  notifyTaskError(
                    'scan:submit-error',
                    rebuild ? '无法创建重建任务' : '无法创建同步任务',
                    describeApiError(error)
                  )
                }
              })
            }
          >
            {busy ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : rebuild ? (
              <RotateCcwIcon className="size-4" />
            ) : (
              <ScanLineIcon className="size-4" />
            )}
            <span>{label}</span>
          </Button>
        )
      })}
    </div>
  )
}

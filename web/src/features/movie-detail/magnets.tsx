import { Link } from '@tanstack/react-router'
import {
  CheckIcon,
  CloudDownloadIcon,
  CopyIcon,
  LoaderCircleIcon,
  SkipForwardIcon
} from 'lucide-react'
import { useState } from 'react'

import type { DiscoverMagnet, useDiscoverMagnets } from '@/api/discover'
import { describeApiError, isPanUnauthorized } from '@/api/client'
import {
  isOfflineTaskActive,
  useAddOffline,
  useOfflineTasks,
  useOfflineControl,
  type OfflineSubmission
} from '@/api/offline'
import { usePanAccount } from '@/api/pan'
import { InlineError } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { formatSize } from '@/lib/format'
import { notifyOfflineTask, notifyTaskError } from '@/features/tasks/task-toast'
import { MovieSubscriptionAction } from './subscription-action'
import { MovieMagnetsSkeleton } from './skeleton'

const sourceLabels: Record<string, string> = { javdb: 'JavDB', javbus: 'JavBus' }
const collapsedMagnetCount = 4

const phaseLabels: Record<OfflineSubmission['phase'], string> = {
  available: '加入 115',
  downloading: '下载中',
  processing: '入库处理中',
  in_library: '已入库',
  downloaded: '已下载'
}

export function MovieMagnets({
  movieID,
  query,
  showSubscription = true
}: {
  movieID: string
  query: ReturnType<typeof useDiscoverMagnets>
  showSubscription?: boolean
}) {
  const account = usePanAccount(Boolean(query.data?.length))
  const unauthorized = isPanUnauthorized(account.error)
  const connected = account.data?.connected === true && !unauthorized
  const accountID = connected ? (account.data?.account?.id ?? '') : ''
  const offline = useOfflineTasks(movieID, accountID, account.data?.directory?.id ?? '')
  const tasks = new Map(offline.data?.map(task => [task.hash, task] as const))
  const checkingStatus = offline.isPending
  const hasDirectory = Boolean(account.data?.directory)
  const [copiedHash, setCopiedHash] = useState('')
  const [copyError, setCopyError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const magnets = query.data ?? []
  const visibleMagnets = expanded ? magnets : magnets.slice(0, collapsedMagnetCount)

  async function copy(magnet: DiscoverMagnet) {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(magnet.uri)
      setCopiedHash(magnet.hash)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium tracking-[0.08em]">磁力与文件</h2>
        {query.data ? (
          <span className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
            {query.data.length} 条
          </span>
        ) : null}
      </div>
      {connected && account.data?.account && !hasDirectory ? (
        <p className="text-xs leading-5 text-muted-foreground">
          请先到{' '}
          <Link to="/settings" className="text-foreground underline underline-offset-4">
            设置页
          </Link>{' '}
          挂载媒体目录，再一键加入 115。
        </p>
      ) : null}
      {connected && offline.isError ? (
        <InlineError onRetry={() => void offline.refetch()} retrying={offline.isFetching}>
          离线任务状态读取失败，请重试。
        </InlineError>
      ) : null}
      {query.isPending ? (
        <MovieMagnetsSkeleton />
      ) : query.isError ? (
        <InlineError onRetry={() => void query.refetch()} retrying={query.isFetching}>
          磁力加载失败
        </InlineError>
      ) : query.data.length === 0 ? (
        showSubscription ? (
          <MovieSubscriptionAction movieID={movieID} />
        ) : (
          <p className="text-xs text-muted-foreground">暂无可用磁力。</p>
        )
      ) : (
        <>
          <div className="border-y border-border/60">
            {visibleMagnets.map(magnet => (
              <MagnetRow
                key={`${movieID}:${magnet.hash}`}
                movieID={movieID}
                magnet={magnet}
                task={tasks.get(magnet.hash)}
                checkingStatus={checkingStatus}
                statusError={offline.isError}
                connected={connected}
                hasDirectory={hasDirectory}
                copied={copiedHash === magnet.hash}
                onCopy={() => void copy(magnet)}
              />
            ))}
          </div>
          {query.data.length > collapsedMagnetCount ? (
            <div className="flex justify-center">
              <button
                type="button"
                aria-expanded={expanded}
                className="min-h-9 rounded-full px-3 text-xs tracking-[0.04em] text-muted-foreground transition-colors hover:bg-foreground/[0.035] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setExpanded(value => !value)}
              >
                {expanded ? '收起' : `展开全部 ${query.data.length} 条`}
              </button>
            </div>
          ) : null}
        </>
      )}
      {copyError ? <InlineError>复制失败，请重试。</InlineError> : null}
    </section>
  )
}

function MagnetRow({
  movieID,
  magnet,
  task,
  checkingStatus,
  statusError,
  connected,
  hasDirectory,
  copied,
  onCopy
}: {
  movieID: string
  magnet: DiscoverMagnet
  task?: OfflineSubmission
  checkingStatus: boolean
  statusError: boolean
  connected: boolean
  hasDirectory: boolean
  copied: boolean
  onCopy: () => void
}) {
  const add = useAddOffline(movieID)
  const next = useOfflineControl('next')
  const submitted = task !== undefined && task.phase !== 'available'
  const busy = add.isPending || (checkingStatus && !submitted)
  let label = '加入 115'
  if (add.isPending) {
    label = '提交中'
  } else if (submitted) {
    label = phaseLabels[task.phase]
  } else if (checkingStatus) {
    label = '读取状态'
  } else if (statusError) {
    label = '状态暂不可用'
  }

  const error = !add.isPending ? task?.error : undefined
  const quality = magnetQuality(magnet)
  const source = magnet.sources?.map(item => sourceLabels[item] ?? item).join(' / ')

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/60">
      <div className="min-w-0">
        <p className="truncate text-sm leading-5 font-medium" title={magnet.name}>
          {magnet.name}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-muted-foreground tabular-nums">
          <span className="text-foreground/75">{quality}</span>
          <span>{formatSize(magnet.size)}</span>
          <span>{magnet.files_count} 文件</span>
          {magnet.has_subtitle ? <span>中字</span> : null}
          {source ? <span>{source}</span> : null}
        </p>
        <p
          className="mt-1 truncate font-mono text-[10px] text-muted-foreground/55 select-all"
          title={magnet.uri}
        >
          {magnet.uri}
        </p>
        {task?.phase === 'in_library' && task.processing ? (
          <p className="mt-1 text-[11px] text-muted-foreground">文件已入库，后台整理中。</p>
        ) : null}
        {task && (task.attempt_count ?? 0) > 1 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            已尝试 {task.attempt_count} 条磁力
            {task.switch_reason ? ` · ${task.switch_reason}` : ''}
          </p>
        ) : null}
        {error ? <InlineError className="mt-1.5">{error}</InlineError> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {task?.can_switch ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="尝试下一条磁力"
            disabled={next.isPending || statusError}
            onClick={() => next.mutate(task.task_id)}
          >
            {next.isPending ? <LoaderCircleIcon className="animate-spin" /> : <SkipForwardIcon />}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={copied ? '已复制' : '复制磁力'}
          aria-label={copied ? '已复制' : '复制磁力'}
          onClick={onCopy}
        >
          {copied ? <CheckIcon className="text-gold" /> : <CopyIcon />}
        </Button>
        {connected ? (
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={!hasDirectory || busy || statusError || submitted}
            onClick={() =>
              add.mutate(magnet.hash, {
                onSuccess: submission => {
                  notifyOfflineTask(submission)
                },
                onError: error => {
                  notifyTaskError(
                    `offline:submit-error:${movieID}`,
                    '加入 115 失败',
                    describeApiError(error)
                  )
                }
              })
            }
          >
            {busy || (task && isOfflineTaskActive(task)) ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : submitted ? (
              <CheckIcon />
            ) : (
              <CloudDownloadIcon />
            )}
            <span className="max-w-28 truncate">{label}</span>
          </Button>
        ) : (
          <Link
            to="/settings"
            className="px-2 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            连接 115
          </Link>
        )}
      </div>
    </div>
  )
}

// The catalogue reports file details but not peers, so quality is inferred
// from the title and the file count takes the spot where seeders would go.
function magnetQuality(magnet: DiscoverMagnet) {
  const text = `${magnet.name} ${magnet.tags?.join(' ') ?? ''}`.toLowerCase()
  if (/(^|\W)(4k|2160p|uhd)(\W|$)/.test(text)) return '4K'
  if (/(^|\W)1080p(\W|$)/.test(text)) return '1080P'
  if (/(^|\W)720p(\W|$)/.test(text)) return '720P'
  return magnet.hd ? 'HD' : 'SD'
}

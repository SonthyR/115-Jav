import { Link, type LinkProps } from '@tanstack/react-router'
import {
  ArchiveIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CloudIcon,
  CopyIcon,
  FilmIcon,
  FolderInputIcon,
  GlobeIcon,
  HardDriveIcon,
  ImageOffIcon,
  LoaderCircleIcon,
  PaletteIcon,
  RotateCcwIcon,
  SettingsIcon,
  SkipForwardIcon,
  TvIcon,
  XIcon,
  type LucideIcon
} from 'lucide-react'
import type { ReactNode } from 'react'

import { useLite } from '@/api/auth'
import { useDataInfo } from '@/api/data'
import { type LibraryFilter, useLibraryMovies } from '@/api/library'
import { useTestNetwork, useNetworkConfig } from '@/api/network'
import {
  isOfflineTaskActive,
  type OfflineSubmission,
  useOfflineActivity,
  useOfflineControl
} from '@/api/offline'
import { useFailedItems } from '@/api/organize'
import { usePanAccount } from '@/api/pan'
import {
  isScanTask,
  isTaskActive,
  type BatchTask,
  type ScanTask,
  useRetryTask,
  useTasks
} from '@/api/tasks'
import { AppPage } from '@/components/app-page'
import { InlineError } from '@/components/error-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { downloadStatus } from '@/features/tasks/download-status'
import { scanCount, scanKind, scanStatus } from '@/features/tasks/scan-status'
import { useTaskConnection } from '@/features/tasks/task-events'
import { formatSize } from '@/lib/format'
import { cn } from 'cn'

export function MePage() {
  return (
    <AppPage contentClassName="gap-0">
      <PageHeader title="概览" description="扫描、下载、整理、备份与设置。" />
      <Stats />
      <TaskConsole />
      <div className="grid gap-10 border-t border-border pt-7 lg:grid-cols-2 lg:gap-12">
        <Health />
        <Status />
      </div>
      <Shortcuts />
    </AppPage>
  )
}

function useTotal(filter: LibraryFilter) {
  return useLibraryMovies(1, filter, 1).data?.total
}

function Stats() {
  const lite = useLite()
  const total = useTotal({})
  const watched = useTotal({ watched: 'yes' })
  const chinese = useTotal({ chinese: true })
  const failed = useTotal({ problem: 'failed' })
  const unsorted = useFailedItems().data?.length
  const account = usePanAccount()
  const connected = account.data?.connected && account.data.account
  const space = connected ? connected.space : undefined

  return (
    <section aria-label="管理统计" className="grid grid-cols-2 gap-2 py-6 lg:grid-cols-4">
      <StatCard
        label="影片"
        value={total}
        caption="115 媒体库"
        link={{ to: '/library' }}
        extra={
          lite ? null : (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <Link to="/browse" search={{ watched: 'yes' }} className="hover:text-foreground">
                看过 {count(watched)}
              </Link>
              <Link to="/browse" search={{ chinese: true }} className="hover:text-foreground">
                中文字幕 {count(chinese)}
              </Link>
            </div>
          )
        }
      />
      <StatCard
        label="待整理"
        value={unsorted}
        caption="失败目录中的片子"
        link={{ to: '/organize' }}
      />
      <StatCard
        label="刮削失败"
        value={failed}
        caption={failed === undefined ? '正在读取' : failed ? '需要处理' : '暂无异常'}
        link={{ to: '/browse', search: { problem: 'failed' } }}
      />
      <StatCard
        label="存储"
        value={space?.used.formatted}
        caption={
          account.isPending
            ? '正在读取 115'
            : account.data?.connected
              ? `115 · 剩余 ${space?.remaining.formatted ?? '—'}`
              : '115 未连接'
        }
        link={{ to: '/settings', search: { tab: 'general' } }}
      />
    </section>
  )
}

function StatCard({
  label,
  value,
  caption,
  link,
  extra
}: {
  label: string
  value?: number | string
  caption: string
  link: LinkProps
  extra?: ReactNode
}) {
  return (
    <article className="rounded-lg border border-border bg-card/55 px-4 py-3.5">
      <Link {...link} className="block">
        <p className="text-[11px] tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1.5 font-mono text-[25px] leading-none tracking-[-0.03em] tabular-nums">
          {value ?? '—'}
        </p>
        <p className="mt-2 font-mono text-[10px] text-muted-foreground/70">{caption}</p>
      </Link>
      {extra}
    </article>
  )
}

type ConsoleTask = {
  key: string
  title: string
  status: string
  detail?: string
  progress?: number | null
  error?: string
  active: boolean
  failed: boolean
  updatedAt: number
  link?: LinkProps
  retryID?: number
  cancelID?: number
  switchID?: number
}

function TaskConsole() {
  const tasks = useTasks()
  const offline = useOfflineActivity()
  const connection = useTaskConnection()
  const retry = useRetryTask()
  const cancel = useOfflineControl('cancel')
  const next = useOfflineControl('next')
  const offlineTasks = (offline.data?.tasks ?? []).filter(
    task => isOfflineTaskActive(task) || task.status === 'failed'
  )
  const scanTasks =
    tasks.data
      ?.filter(isScanTask)
      .filter(task => !task.offline_task_id && (isTaskActive(task) || task.status === 'failed')) ??
    []
  const batchTasks =
    tasks.data?.filter(
      (task): task is BatchTask =>
        task.type === 'subscription_batch' && (isTaskActive(task) || task.status === 'failed')
    ) ?? []
  const rows: ConsoleTask[] = [
    ...offlineTasks.map(offlineRow),
    ...scanTasks.map(scanRow),
    ...batchTasks.map(batchRow)
  ].sort(
    (left, right) =>
      Number(right.active) - Number(left.active) ||
      Number(right.failed) - Number(left.failed) ||
      right.updatedAt - left.updatedAt
  )
  const loading = tasks.isPending || offline.isPending
  const hasError = tasks.isError || offline.isError

  return (
    <section className="border-t border-border pt-6 pb-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium tracking-[0.08em]">正在处理</h2>
        <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground/70">
          {connection.status === 'connected'
            ? '实时更新'
            : connection.status === 'connecting'
              ? '连接中'
              : '等待重连'}
        </span>
      </div>
      {hasError ? (
        <InlineError
          className="mt-3"
          retrying={tasks.isFetching || offline.isFetching}
          onRetry={() => {
            if (tasks.isError) void tasks.refetch()
            if (offline.isError) void offline.refetch()
          }}
        >
          部分任务状态暂时无法读取。
        </InlineError>
      ) : null}
      {rows.length === 0 ? (
        <div className="mt-3 border-y border-border py-9 text-center text-xs text-muted-foreground">
          {loading ? '正在读取任务…' : '当前没有进行中的任务'}
        </div>
      ) : (
        <ul className="mt-2 border-t border-border">
          {rows.map(row => (
            <TaskRow
              key={row.key}
              row={row}
              retrying={retry.isPending}
              cancelling={cancel.isPending}
              switching={next.isPending}
              onRetry={id => retry.mutate(id)}
              onCancel={row => {
                if (window.confirm(`取消 ${row.title}？`)) cancel.mutate(row.cancelID!)
              }}
              onSwitch={id => next.mutate(id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function offlineRow(task: OfflineSubmission, index: number): ConsoleTask {
  const active = isOfflineTaskActive(task)
  const link: LinkProps | undefined = task.library_id
    ? { to: '/movie/$id', params: { id: String(task.library_id) } }
    : undefined
  const attempts = (task.attempt_count ?? 0) > 1 ? `已尝试 ${task.attempt_count} 条磁力` : undefined

  return {
    key: `offline:${task.task_id}:${index}`,
    title: task.code,
    status: offlineStatus(task),
    detail: [attempts, task.switch_reason].filter(Boolean).join(' · ') || undefined,
    progress: active ? (task.phase === 'downloading' ? task.progress : null) : undefined,
    error: !active ? task.error : undefined,
    active,
    failed: task.status === 'failed',
    updatedAt: task.retry_at ? new Date(task.retry_at).getTime() : 0,
    link,
    cancelID: active && task.can_cancel ? task.task_id : undefined,
    switchID: task.can_switch ? task.task_id : undefined
  }
}

function scanRow(task: ScanTask): ConsoleTask {
  const active = isTaskActive(task)
  return {
    key: `scan:${task.id}`,
    title: scanKind(task),
    status: scanStatus(task),
    detail: scanCount(task),
    progress: active
      ? task.paused || task.scan.metadata_total > 0
        ? task.progress
        : null
      : undefined,
    error: task.status === 'failed' ? task.error : undefined,
    active,
    failed: task.status === 'failed',
    updatedAt: new Date(task.updated_at).getTime(),
    link: task.movie_id
      ? { to: '/movie/$id', params: { id: String(task.movie_id) } }
      : { to: '/library' },
    retryID: task.can_retry ? task.id : undefined
  }
}

function batchRow(task: BatchTask): ConsoleTask {
  const active = isTaskActive(task)
  const { total, processed, submitted, waiting, failed } = task.batch
  return {
    key: `batch:${task.id}`,
    title: '批量入库',
    status: active ? '处理中' : '失败',
    detail: `${processed} / ${total} 部 · 已提交 ${submitted} · 等待磁力 ${waiting}${
      failed ? ` · 失败 ${failed}` : ''
    }`,
    progress: active && total > 0 ? (processed / total) * 100 : undefined,
    error: task.status === 'failed' ? task.error : undefined,
    active,
    failed: task.status === 'failed',
    updatedAt: new Date(task.updated_at).getTime(),
    link: { to: '/subscriptions' },
    retryID: task.can_retry ? task.id : undefined
  }
}

function offlineStatus(task: OfflineSubmission) {
  if (task.status === 'failed') return '失败'
  if (task.processing || task.phase === 'processing') return '整理入库中'
  if (task.phase === 'downloading') {
    return `${downloadStatus(task)} · ${Math.round(task.progress)}%`
  }
  if (task.phase === 'in_library') return '已入库'
  if (task.phase === 'downloaded') return '已下载'
  return '等待下载'
}

function TaskRow({
  row,
  retrying,
  cancelling,
  switching,
  onRetry,
  onCancel,
  onSwitch
}: {
  row: ConsoleTask
  retrying: boolean
  cancelling: boolean
  switching: boolean
  onRetry: (id: number) => void
  onCancel: (row: ConsoleTask) => void
  onSwitch: (id: number) => void
}) {
  return (
    <li className="grid gap-3 border-b border-border py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              row.failed ? 'bg-destructive' : row.active ? 'bg-gold' : 'bg-success'
            )}
          />
          {row.link ? (
            <Link
              {...row.link}
              className="min-w-0 truncate text-[12px] font-medium hover:text-gold"
            >
              {row.title}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-[12px] font-medium">{row.title}</span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {row.status}
          </span>
        </div>
        {row.detail ? (
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/75">
            {row.detail}
          </p>
        ) : null}
        {row.progress !== undefined ? (
          <Progress
            value={row.progress}
            className="mt-2 h-1 [&_[data-slot=progress-indicator]]:bg-gold"
          />
        ) : null}
        {row.error ? (
          <p className="mt-1.5 line-clamp-2 text-xs text-destructive">{row.error}</p>
        ) : null}
      </div>
      {row.retryID !== undefined || row.cancelID !== undefined || row.switchID !== undefined ? (
        <div className="flex items-center gap-1 md:justify-end">
          {row.switchID !== undefined ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 md:h-8"
              disabled={switching}
              onClick={() => onSwitch(row.switchID!)}
            >
              <SkipForwardIcon />
              换源
            </Button>
          ) : null}
          {row.retryID !== undefined ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 md:h-8"
              disabled={retrying}
              onClick={() => onRetry(row.retryID!)}
            >
              <RotateCcwIcon />
              重试
            </Button>
          ) : null}
          {row.cancelID !== undefined ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 md:h-8"
              disabled={cancelling}
              onClick={() => onCancel(row)}
            >
              <XIcon />
              取消
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function Health() {
  const failed = useTotal({ problem: 'failed' })
  const noCover = useTotal({ problem: 'nocover' })
  const versions = useTotal({ problem: 'versions' })
  const unsorted = useFailedItems().data?.length
  return (
    <ConsolePanel title="片库健康" description="点开即可查看对应的影片或整理记录">
      <Row
        icon={CircleAlertIcon}
        label="刮削失败"
        count={failed}
        link={{ to: '/browse', search: { problem: 'failed' } }}
      />
      <Row
        icon={ImageOffIcon}
        label="缺封面"
        count={noCover}
        link={{ to: '/browse', search: { problem: 'nocover' } }}
      />
      <Row
        icon={CopyIcon}
        label="多个文件"
        count={versions}
        link={{ to: '/browse', search: { problem: 'versions' } }}
        neutral
      />
      <Row icon={FolderInputIcon} label="整理失败" count={unsorted} link={{ to: '/organize' }} />
    </ConsolePanel>
  )
}

function Status() {
  const account = usePanAccount()
  const info = useDataInfo()
  const network = useNetworkConfig()
  const test = useTestNetwork()
  const latest = info.data?.backups?.[0]
  const connected = account.data?.connected
  const javdb = test.data?.javdb

  return (
    <ConsolePanel title="运行状态" description="出问题时先看这里">
      <StatusRow
        icon={CloudIcon}
        label="115 网盘"
        ok={
          account.isPending || account.isError
            ? undefined
            : connected && Boolean(account.data?.directory)
        }
        detail={
          account.isPending
            ? '读取中'
            : account.isError
              ? '无法读取 115 状态，请检查后端服务和网络'
              : !connected
                ? '未登录，去设置里扫码'
                : account.data?.directory
                  ? `已连接 · ${account.data.directory.name}`
                  : '已登录，还没选媒体库目录'
        }
        link={{ to: '/settings' }}
      />
      <StatusRow
        icon={GlobeIcon}
        label="JavDB 连接"
        ok={javdb ? javdb.available : undefined}
        detail={
          test.isPending
            ? '检测中…'
            : javdb
              ? javdb.available
                ? `正常 · ${javdb.latency_ms ?? '?'} ms`
                : `连不上：${javdb.error ?? '未知原因'}，检查代理（如 v2rayN）是否开着`
              : network.data?.enabled
                ? `通过代理 ${network.data.url}`
                : '直连'
        }
        action={
          <Button
            size="sm"
            variant="outline"
            className="h-10 md:h-8"
            disabled={!network.data || test.isPending}
            onClick={() => network.data && test.mutate(network.data)}
          >
            {test.isPending ? <LoaderCircleIcon className="animate-spin" /> : null}
            检测
          </Button>
        }
      />
      <StatusRow
        icon={ArchiveIcon}
        label="数据库备份"
        ok={info.data ? Boolean(latest) : undefined}
        detail={
          info.isError
            ? '无法读取备份状态'
            : latest
              ? `最近 ${new Date(latest.created_at).toLocaleString()} · 共 ${info.data?.backups?.length} 份，保留 7 天`
              : '每天自动备份到 data/backups，启动后一小时内生成第一份'
        }
      />
      <StatusRow
        icon={HardDriveIcon}
        label="数据占用"
        ok={info.data ? true : undefined}
        detail={
          info.isError
            ? '无法读取数据占用'
            : info.data
              ? `数据库 ${formatSize(info.data.database_size_bytes)} · 图片缓存 ${formatSize(info.data.cache.size_bytes)}（每天自动清理不用的）`
              : '读取中'
        }
        link={{ to: '/settings', search: { tab: 'general' } }}
      />
    </ConsolePanel>
  )
}

function Shortcuts() {
  const links: Array<{ icon: LucideIcon; label: string; link: LinkProps }> = [
    {
      icon: FolderInputIcon,
      label: '整理规则',
      link: { to: '/settings', search: { tab: 'organize' } }
    },
    { icon: TvIcon, label: 'Emby 与播放器', link: { to: '/settings', search: { tab: 'emby' } } },
    { icon: FilmIcon, label: '刮削来源', link: { to: '/settings', search: { tab: 'scraping' } } },
    { icon: GlobeIcon, label: '网络代理', link: { to: '/settings', search: { tab: 'network' } } },
    {
      icon: PaletteIcon,
      label: '外观与隐私',
      link: { to: '/settings', search: { tab: 'general' } }
    },
    { icon: SettingsIcon, label: '全部设置', link: { to: '/settings' } }
  ]
  return (
    <section className="border-t border-border pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium tracking-[0.08em]">快捷操作</h2>
        <span className="font-mono text-[10px] text-muted-foreground/70">SETTINGS</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {links.map(item => (
          <Link
            key={item.label}
            {...item.link}
            className="flex min-h-11 items-center gap-2.5 rounded-md border border-border px-3 text-xs tracking-wide text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-card hover:text-foreground"
          >
            <item.icon className="size-4" strokeWidth={1.5} />
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  )
}

function ConsolePanel({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium tracking-[0.08em]">{title}</h2>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
      <div className="mt-3 divide-y divide-border/80 border-t border-border">{children}</div>
    </section>
  )
}

function Row({
  icon: Icon,
  label,
  count,
  link,
  neutral
}: {
  icon: LucideIcon
  label: string
  count?: number
  link: LinkProps
  neutral?: boolean
}) {
  const quiet = count === undefined || count === 0
  return (
    <Link
      {...link}
      className="flex min-h-11 items-center gap-3 py-2.5 text-xs hover:text-foreground"
    >
      <Icon
        className={cn('size-3.5', quiet || neutral ? 'text-muted-foreground' : 'text-warning')}
      />
      <span className="flex-1">{label}</span>
      <span
        className={cn(
          'font-mono text-[11px] tabular-nums',
          quiet ? 'text-muted-foreground' : neutral ? 'font-medium' : 'font-medium text-warning'
        )}
      >
        {count ?? '—'}
      </span>
      <ChevronRightIcon className="size-3.5 text-muted-foreground/55" />
    </Link>
  )
}

function StatusRow({
  icon: Icon,
  label,
  ok,
  detail,
  action,
  link
}: {
  icon: LucideIcon
  label: string
  ok?: boolean
  detail: string
  action?: ReactNode
  link?: LinkProps
}) {
  const body = (
    <>
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          {label}
          {ok === true ? <CircleCheckIcon className="size-3.5 text-success" /> : null}
          {ok === false ? <CircleAlertIcon className="size-3.5 text-warning" /> : null}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</p>
      </div>
    </>
  )
  return (
    <div className="flex items-start gap-3 py-3 text-sm">
      {link ? (
        <Link {...link} className="flex min-w-0 flex-1 items-start gap-3">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
      )}
      {action}
    </div>
  )
}

function count(value?: number) {
  return value === undefined ? '—' : value.toLocaleString('zh-CN')
}

import { Link } from '@tanstack/react-router'
import { LoaderCircleIcon, PlayIcon, RotateCcwIcon, SettingsIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { describeApiError } from '@/api/client'
import {
  type FailedItem,
  type OrganizeEntry,
  useFailedItems,
  useOrganizeConfig,
  useOrganizeLog,
  useRetryOrganize,
  useRunOrganize
} from '@/api/organize'
import { AppPage } from '@/components/app-page'
import { EmptyState } from '@/components/empty-state'
import { InlineError } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OrganizeLogList, statusLabels } from './log-list'

type LogFilter = 'all' | OrganizeEntry['status']

export function OrganizePage() {
  const config = useOrganizeConfig()
  const failed = useFailedItems()
  const run = useRunOrganize()
  const enabled = config.data?.rules?.some(rule => rule.enabled) ?? false
  const hasFailedFolder = config.data?.rules?.some(rule => rule.failed.id) ?? false

  return (
    <AppPage contentClassName="gap-0">
      <header className="flex flex-col items-start justify-between gap-5 border-b border-border pb-6 sm:flex-row">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.18em] text-gold uppercase">
            MANAGEMENT / ORGANIZE
          </p>
          <h1 className="mt-2 font-serif text-[38px] leading-none font-semibold tracking-[-0.03em] md:text-[44px]">
            下载与整理
          </h1>
          <p className="mt-3 max-w-xl text-xs leading-6 tracking-wide text-muted-foreground">
            整理前目录、失败的片子与执行记录。
          </p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <Button
            type="button"
            className="h-10 md:h-9"
            disabled={!enabled || run.isPending}
            onClick={() =>
              run.mutate(undefined, {
                onSuccess: () => toast.success('已开始整理，大约半分钟后在日志里看到结果'),
                onError: error => toast.error(describeApiError(error))
              })
            }
          >
            {run.isPending ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              <PlayIcon className="size-4" />
            )}
            立即整理
          </Button>
          <Button asChild variant="outline" className="h-10 md:h-9">
            <Link to="/settings" search={{ tab: 'organize' }}>
              <SettingsIcon className="size-4" />
              整理设置
            </Link>
          </Button>
        </div>
      </header>

      {config.isSuccess && !enabled ? (
        <InlineError className="border-b border-border py-3">
          还没有启用整理，先在整理设置里选择整理前目录并打开自动整理。
        </InlineError>
      ) : null}

      <Tabs defaultValue="failed" className="gap-0">
        <div className="border-b border-border">
          <TabsList variant="line" className="h-11">
            <TabsTrigger value="failed">
              失败的片子
              {failed.data?.length ? (
                <span className="font-mono text-[10px] tabular-nums">{failed.data.length}</span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="log">整理日志</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="failed" className="pt-5">
          {!hasFailedFolder && config.isSuccess ? (
            <EmptyState
              className="min-h-64 py-12"
              title="没有设置失败目录，整理失败的片子会留在整理前目录里"
            />
          ) : failed.isPending ? (
            <p className="py-8 text-xs text-muted-foreground">正在读取失败目录…</p>
          ) : failed.isError ? (
            <InlineError className="py-6" onRetry={() => void failed.refetch()}>
              {describeApiError(failed.error)}
            </InlineError>
          ) : failed.data.length === 0 ? (
            <EmptyState className="min-h-64 py-12" title="失败目录是空的" />
          ) : (
            <ul className="border-t border-border">
              {failed.data.map(item => (
                <FailedRow key={`${item.folder}/${item.name}`} item={item} />
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="log" className="pt-5">
          <LogPanel />
        </TabsContent>
      </Tabs>
    </AppPage>
  )
}

function FailedRow({ item }: { item: FailedItem }) {
  const [code, setCode] = useState(item.code ?? '')
  const retry = useRetryOrganize()

  function submit() {
    retry.mutate(
      { name: item.name, code },
      {
        onSuccess: entry => {
          if (entry.status === 'done') toast.success(`已整理到 ${entry.target ?? ''}`)
          else if (entry.status === 'dry_run')
            toast.info(`演练模式：会整理到 ${entry.target ?? ''}`)
          else toast.error(entry.detail ?? '整理失败')
        },
        onError: error => toast.error(describeApiError(error))
      }
    )
  }

  return (
    <li className="grid gap-3 border-b border-border py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <p className="text-[12px] font-medium break-all">{item.name}</p>
        <p className="mt-1 font-mono text-[10px] leading-5 break-all text-muted-foreground">
          {item.reason ?? '没有找到失败原因'} · {item.folder}
        </p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row md:justify-end"
        onSubmit={event => {
          event.preventDefault()
          submit()
        }}
      >
        <Input
          value={code}
          placeholder="番号，如 SSIS-123"
          className="h-10 w-full font-mono text-xs md:h-8 md:w-44"
          onChange={event => setCode(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          className="h-10 md:h-8"
          disabled={!code.trim() || retry.isPending}
        >
          {retry.isPending ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <RotateCcwIcon className="size-4" />
          )}
          重新整理
        </Button>
      </form>
    </li>
  )
}

function LogPanel() {
  const log = useOrganizeLog(true)
  const [filter, setFilter] = useState<LogFilter>('all')
  const entries = log.data?.filter(entry => filter === 'all' || entry.status === filter) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          筛选
          <Select value={filter} onValueChange={value => setFilter(value as LogFilter)}>
            <SelectTrigger className="h-10 w-32 font-mono text-xs md:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {Object.entries(statusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {log.isSuccess ? (
          <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
            {entries.length} 条记录
          </span>
        ) : null}
      </div>
      {log.isPending ? (
        <p className="py-8 text-xs text-muted-foreground">正在读取…</p>
      ) : log.isError ? (
        <InlineError className="py-6" onRetry={() => void log.refetch()}>
          整理日志读取失败。
        </InlineError>
      ) : entries.length === 0 ? (
        <EmptyState className="min-h-64 py-12" title="没有符合条件的整理记录" />
      ) : (
        <OrganizeLogList entries={entries} />
      )}
    </div>
  )
}

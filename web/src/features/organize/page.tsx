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
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <AppPage>
      <PageHeader
        title="整理"
        description="整理前目录的整理记录，以及没整理成功的片子"
        inlineActions
      >
        <Button
          type="button"
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
        <Button asChild variant="outline">
          <Link to="/settings" search={{ tab: 'organize' }}>
            <SettingsIcon className="size-4" />
            整理设置
          </Link>
        </Button>
      </PageHeader>

      {config.isSuccess && !enabled ? (
        <InlineError>还没有启用整理，先在整理设置里选择整理前目录并打开自动整理。</InlineError>
      ) : null}

      <Tabs defaultValue="failed">
        <TabsList>
          <TabsTrigger value="failed">
            失败的片子{failed.data?.length ? ` (${failed.data.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="log">整理日志</TabsTrigger>
        </TabsList>
        <TabsContent value="failed">
          {!hasFailedFolder && config.isSuccess ? (
            <EmptyState
              className="py-12"
              title="没有设置失败目录，整理失败的片子会留在整理前目录里"
            />
          ) : failed.isPending ? (
            <p className="text-sm text-muted-foreground">正在读取失败目录…</p>
          ) : failed.isError ? (
            <InlineError onRetry={() => void failed.refetch()}>
              {describeApiError(failed.error)}
            </InlineError>
          ) : failed.data.length === 0 ? (
            <EmptyState className="py-12" title="失败目录是空的" />
          ) : (
            <ul className="space-y-3">
              {failed.data.map(item => (
                <FailedRow key={`${item.folder}/${item.name}`} item={item} />
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="log">
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
    <li>
      <Card>
        <CardContent className="min-w-0 space-y-3">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-medium break-all">{item.name}</div>
            <div className="text-xs break-all text-muted-foreground">
              {item.reason ?? '没有找到失败原因'} · {item.folder}
            </div>
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={event => {
              event.preventDefault()
              submit()
            }}
          >
            <Input
              value={code}
              placeholder="填写番号，如 SSIS-123"
              className="w-48"
              onChange={event => setCode(event.target.value)}
            />
            <Button type="submit" variant="outline" disabled={!code.trim() || retry.isPending}>
              {retry.isPending ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <RotateCcwIcon className="size-4" />
              )}
              重新整理
            </Button>
          </form>
        </CardContent>
      </Card>
    </li>
  )
}

function LogPanel() {
  const log = useOrganizeLog(true)
  const [filter, setFilter] = useState<LogFilter>('all')
  const entries = log.data?.filter(entry => filter === 'all' || entry.status === filter) ?? []

  return (
    <div className="space-y-3">
      <Select value={filter} onValueChange={value => setFilter(value as LogFilter)}>
        <SelectTrigger className="w-32">
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
      {log.isPending ? (
        <p className="text-sm text-muted-foreground">正在读取…</p>
      ) : log.isError ? (
        <InlineError onRetry={() => void log.refetch()}>整理日志读取失败。</InlineError>
      ) : entries.length === 0 ? (
        <EmptyState className="py-12" title="没有符合条件的整理记录" />
      ) : (
        <OrganizeLogList entries={entries} />
      )}
    </div>
  )
}

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
  type LucideIcon,
  PaletteIcon,
  SettingsIcon,
  TvIcon
} from 'lucide-react'
import type { ReactNode } from 'react'

import { useDataInfo } from '@/api/data'
import { type LibraryFilter, useLibraryMovies } from '@/api/library'
import { isOfflineTaskActive, useOfflineActivity } from '@/api/offline'
import { useFailedItems } from '@/api/organize'
import { usePanAccount } from '@/api/pan'
import { useTestNetwork, useNetworkConfig } from '@/api/network'
import { AppPage } from '@/components/app-page'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatSize } from '@/lib/format'
import { cn } from 'cn'

// The household page: what is in the library, what needs attention, whether
// the services behind it are reachable, and the way to every setting.
export function MePage() {
  return (
    <AppPage>
      <PageHeader title="我的" description="片库概况、需要处理的问题和运行状态" />
      <Stats />
      <div className="grid gap-6 lg:grid-cols-2">
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
  const total = useTotal({})
  const watched = useTotal({ watched: 'yes' })
  const chinese = useTotal({ chinese: true })
  const downloading = useOfflineActivity().data?.tasks.filter(isOfflineTaskActive).length
  const items: Array<{ label: string; value?: number; link: LinkProps }> = [
    { label: '影片', value: total, link: { to: '/browse' } },
    { label: '看过', value: watched, link: { to: '/browse', search: { watched: 'yes' } } },
    { label: '中文字幕', value: chinese, link: { to: '/browse', search: { chinese: true } } },
    { label: '正在下载', value: downloading, link: { to: '/organize' } }
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(item => (
        <Link
          key={item.label}
          {...item.link}
          className="rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-muted/60"
        >
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{item.value ?? '–'}</p>
        </Link>
      ))}
    </div>
  )
}

function Health() {
  const failed = useTotal({ problem: 'failed' })
  const noCover = useTotal({ problem: 'nocover' })
  const versions = useTotal({ problem: 'versions' })
  const unsorted = useFailedItems().data?.length
  return (
    <Panel title="片库健康" description="点开就是对应的影片，可以在详情页重新刮削或改番号">
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
        label="有多个文件（多版本或分段）"
        count={versions}
        link={{ to: '/browse', search: { problem: 'versions' } }}
        neutral
      />
      <Row icon={FolderInputIcon} label="整理失败" count={unsorted} link={{ to: '/organize' }} />
    </Panel>
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
    <Panel title="运行状态" description="出问题时先看这里">
      <StatusRow
        icon={CloudIcon}
        label="115 网盘"
        ok={account.isPending ? undefined : connected && Boolean(account.data?.directory)}
        detail={
          account.isPending
            ? '读取中'
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
          latest
            ? `最近 ${new Date(latest.created_at).toLocaleString()} · 共 ${info.data?.backups?.length} 份，保留 7 天`
            : '每天自动备份到 data/backups，启动后一小时内生成第一份'
        }
      />
      <StatusRow
        icon={HardDriveIcon}
        label="数据占用"
        ok={info.data ? true : undefined}
        detail={
          info.data
            ? `数据库 ${formatSize(info.data.database_size_bytes)} · 图片缓存 ${formatSize(info.data.cache.size_bytes)}（每天自动清理不用的）`
            : '读取中'
        }
        link={{ to: '/settings', search: { tab: 'general' } }}
      />
    </Panel>
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
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">设置</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {links.map(item => (
          <Link
            key={item.label}
            {...item.link}
            className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-border transition-colors hover:bg-muted/60"
          >
            <item.icon className="size-4 text-muted-foreground" />
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  )
}

function Panel({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="pb-2 text-sm text-muted-foreground">{description}</p>
        <div className="divide-y">{children}</div>
      </CardContent>
    </Card>
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
  // Not a fault, only worth a look.
  neutral?: boolean
}) {
  const quiet = count === undefined || count === 0
  return (
    <Link {...link} className="flex items-center gap-3 py-3 text-sm hover:text-foreground">
      <Icon className={cn('size-4', quiet || neutral ? 'text-muted-foreground' : 'text-warning')} />
      <span className="flex-1">{label}</span>
      <span
        className={cn(
          'tabular-nums',
          quiet ? 'text-muted-foreground' : neutral ? 'font-medium' : 'font-medium text-warning'
        )}
      >
        {count ?? '–'}
      </span>
      <ChevronRightIcon className="size-4 text-muted-foreground" />
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
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-medium">
          {label}
          {ok === true ? <CircleCheckIcon className="size-4 text-success" /> : null}
          {ok === false ? <CircleAlertIcon className="size-4 text-warning" /> : null}
        </p>
        <p className="text-muted-foreground">{detail}</p>
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

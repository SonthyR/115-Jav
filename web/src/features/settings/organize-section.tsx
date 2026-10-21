import { FolderInputIcon, FolderOpenIcon, ListIcon, LoaderCircleIcon, PlayIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { describeApiError } from '@/api/client'
import {
  type OrganizeConfig,
  type OrganizeFolder,
  type OrganizeRule,
  useOrganizeConfig,
  useOrganizeLog,
  useRunOrganize,
  useUpdateOrganizeConfig
} from '@/api/organize'
import { usePanAccount } from '@/api/pan'
import { InlineError } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { OrganizeLogList } from '@/features/organize/log-list'
import { ActorMergeDialog } from './actor-merge-dialog'
import { PanFolderDialog } from './pan-folder-dialog'
import { SettingRow, SettingsSection } from './shared'

const emptyRule: OrganizeRule = {
  enabled: false,
  dry_run: true,
  source: { id: '', path: '' },
  failed: { id: '', path: '' }
}

const actorOptions = [1, 2, 3, 4, 5]
const sizeOptions = [100, 200, 300, 500, 1000]

export function OrganizeSection() {
  const account = usePanAccount()
  const settings = useOrganizeConfig()
  const update = useUpdateOrganizeConfig()
  const run = useRunOrganize()
  const config = settings.data
  const rule = config?.rules?.[0] ?? emptyRule
  const accountID = account.data?.account?.id
  const mounted = Boolean(account.data?.directory)
  const disabled = settings.isLoading || settings.isError || update.isPending

  function save(patch: Partial<OrganizeConfig>, rulePatch?: Partial<OrganizeRule>) {
    if (!config) return
    const nextRule = { ...rule, ...rulePatch }
    const next = {
      ...config,
      ...patch,
      rules: nextRule.source.id ? [nextRule] : []
    }
    if (rulePatch && !nextRule.source.id) {
      toast.error('请先选择整理前目录')
      return
    }
    update.mutate(next, {
      onSuccess: () => toast.success('整理设置已保存'),
      onError: error => toast.error(describeApiError(error))
    })
  }

  return (
    <SettingsSection icon={<FolderInputIcon className="size-4" />} title="115 整理">
      <FolderRow
        title="整理前目录"
        description="放新片子的 115 目录，整理后移入媒体目录的 演员/番号 文件夹"
        folder={rule.source}
        accountID={accountID}
        disabled={disabled || !accountID}
        onPick={source => save({}, { source })}
      />
      <FolderRow
        title="失败目录"
        description="识别不了番号、刮削失败或媒体库已有的片子会移到这里；不选则留在原地"
        folder={rule.failed}
        accountID={accountID}
        disabled={disabled || !accountID || !rule.source.id}
        onPick={failed => save({}, { failed })}
      />

      <SettingRow
        title="自动整理"
        description="每 5 分钟检查一次整理前目录；一键加入 115 的下载完成后也会自动整理"
        inline
      >
        <Switch
          checked={rule.enabled}
          disabled={disabled || !rule.source.id || !mounted}
          onCheckedChange={enabled => save({}, { enabled })}
        />
      </SettingRow>

      <SettingRow
        title="演练模式"
        description="只在整理日志里写出打算怎么整理，不移动、不改名、不删除任何文件"
        inline
      >
        <Switch
          checked={rule.dry_run}
          disabled={disabled || !rule.source.id}
          onCheckedChange={dry_run => save({}, { dry_run })}
        />
      </SettingRow>

      <SettingRow
        title="演员目录"
        description="超过这个人数的作品放进「多人作品」，没有演员的放进「未知演员」"
      >
        <Select
          value={String(config?.max_actors ?? 3)}
          disabled={disabled}
          onValueChange={value => save({ max_actors: Number(value) })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actorOptions.map(count => (
              <SelectItem key={count} value={String(count)}>
                最多 {count} 人
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow title="最小视频" description="小于这个大小的视频当作广告或样片，不参与整理">
        <Select
          value={String(config?.min_video_mb ?? 200)}
          disabled={disabled}
          onValueChange={value => save({ min_video_mb: Number(value) })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sizeOptions.map(size => (
              <SelectItem key={size} value={String(size)}>
                {size} MB
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        title="清理残留"
        description="整理完把原文件夹（广告、种子说明、小视频等）删到 115 回收站"
        inline
      >
        <Switch
          checked={config?.clean_junk ?? true}
          disabled={disabled}
          onCheckedChange={clean_junk => save({ clean_junk })}
        />
      </SettingRow>

      <SettingRow title="整理日志" description="立即整理会检查两次，确认文件已经传完再动手">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !rule.enabled || run.isPending}
            onClick={() =>
              run.mutate(undefined, {
                onSuccess: () => toast.success('已开始整理，大约半分钟后在整理日志里看到结果'),
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
          <LogDialog />
        </div>
      </SettingRow>

      <SettingRow
        title="演员目录合并"
        description="找出同一个演员的不同写法（三上悠亜 / 三上悠亚、日文名 / 中文译名），合并成一个目录"
      >
        <ActorMergeDialog disabled={disabled || !mounted} />
      </SettingRow>

      {!mounted && account.data ? (
        <InlineError>请先在 115 网盘里挂载媒体目录，整理后的文件会放进媒体目录。</InlineError>
      ) : null}
      {settings.isError ? <InlineError>后端服务暂不可用，无法读取整理设置。</InlineError> : null}
    </SettingsSection>
  )
}

function FolderRow({
  title,
  description,
  folder,
  accountID,
  disabled,
  onPick
}: {
  title: string
  description: string
  folder: OrganizeFolder
  accountID?: string
  disabled: boolean
  onPick: (folder: OrganizeFolder) => void
}) {
  return (
    <SettingRow
      title={title}
      description={
        <>
          {description}
          <span className="block text-foreground">{folder.path || '未选择'}</span>
        </>
      }
      inline
    >
      {accountID ? (
        <PanFolderDialog
          accountID={accountID}
          title={`选择${title}`}
          description="进入目标文件夹后，点击“选择当前目录”。"
          initialID={folder.id}
          onPick={onPick}
        >
          <Button type="button" variant="outline" size="icon" disabled={disabled}>
            <FolderOpenIcon className="size-4" />
          </Button>
        </PanFolderDialog>
      ) : (
        <Button type="button" variant="outline" size="icon" disabled>
          <FolderOpenIcon className="size-4" />
        </Button>
      )}
    </SettingRow>
  )
}

function LogDialog() {
  const [open, setOpen] = useState(false)
  const log = useOrganizeLog(open)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ListIcon className="size-4" />
          查看日志
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>整理日志</DialogTitle>
          <DialogDescription>
            最近 300 条，最新的在最上面；失败的片子可以在
            <Link to="/organize" className="mx-1 underline underline-offset-4">
              整理页
            </Link>
            填番号重试
          </DialogDescription>
        </DialogHeader>
        {log.isPending ? (
          <p className="text-sm text-muted-foreground">正在读取…</p>
        ) : log.isError ? (
          <InlineError onRetry={() => void log.refetch()}>整理日志读取失败。</InlineError>
        ) : log.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有整理记录。</p>
        ) : (
          <OrganizeLogList entries={log.data} />
        )}
      </DialogContent>
    </Dialog>
  )
}

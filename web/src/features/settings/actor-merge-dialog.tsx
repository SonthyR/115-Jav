import { LoaderCircleIcon, MergeIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { describeApiError } from '@/api/client'
import {
  type ActorFolder,
  type ActorFolders,
  useActorFolders,
  useMergeActors
} from '@/api/organize'
import { InlineError } from '@/components/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type Plan = {
  folders: ActorFolder[]
  target: string
  include: boolean
}

const manualLimit = 60

export function ActorMergeDialog({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const found = useActorFolders(open)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <MergeIcon className="size-4" />
          查找重复演员
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>演员目录合并</DialogTitle>
          <DialogDescription>
            点名字选择保留哪个目录。合并会在 115 上把番号文件夹移过去、旧目录删到回收站，NFO
            里的演员名也改成保留的名字，之后新片会自动进保留的目录。
          </DialogDescription>
        </DialogHeader>
        {found.isPending ? (
          <p className="text-sm text-muted-foreground">正在查找…</p>
        ) : found.isError ? (
          <InlineError onRetry={() => void found.refetch()}>
            {describeApiError(found.error)}
          </InlineError>
        ) : (
          <MergePlanner key={found.dataUpdatedAt} data={found.data} onDone={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

// MergePlanner starts from the groups the server found; refetching remounts it.
function MergePlanner({ data, onDone }: { data: ActorFolders; onDone: () => void }) {
  const merge = useMergeActors()
  const [plans, setPlans] = useState<Plan[]>(() =>
    data.groups.map(group => ({ folders: group.folders, target: group.suggested, include: true }))
  )
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const planned = useMemo(
    () => new Set(plans.flatMap(plan => plan.folders.map(f => f.name))),
    [plans]
  )
  const matches = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return []
    return data.folders
      .filter(folder => folder.name.toLowerCase().includes(query) && !planned.has(folder.name))
      .slice(0, manualLimit)
  }, [filter, data.folders, planned])
  const selected = plans.filter(plan => plan.include)

  function update(index: number, patch: Partial<Plan>) {
    setPlans(current => current.map((plan, i) => (i === index ? { ...plan, ...patch } : plan)))
  }

  function addManual() {
    const folders = data.folders.filter(folder => picked.includes(folder.name))
    folders.sort((a, b) => b.movies - a.movies)
    const kept = folders[0]
    if (!kept || folders.length < 2) return
    setPlans(current => [...current, { folders, target: kept.name, include: true }])
    setPicked([])
    setFilter('')
  }

  function submit() {
    merge.mutate(
      selected.map(plan => ({
        target: plan.target,
        sources: plan.folders.map(folder => folder.name).filter(name => name !== plan.target)
      })),
      {
        onSuccess: () => {
          toast.success('已开始合并，进度和结果在整理日志里')
          onDone()
        },
        onError: error => toast.error(describeApiError(error))
      }
    )
  }

  return (
    <>
      <div className="min-w-0 space-y-4">
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            没有找到重复的演员目录，可以在下面手动合并。
          </p>
        ) : (
          <ul className="space-y-2">
            {plans.map((plan, index) => (
              <li
                key={plan.folders.map(f => f.name).join('|')}
                className="flex min-w-0 gap-3 rounded-xl border p-3"
              >
                <Checkbox
                  className="mt-1"
                  checked={plan.include}
                  onCheckedChange={checked => update(index, { include: checked === true })}
                />
                <div className="flex min-w-0 flex-wrap gap-2">
                  {plan.folders.map(folder => (
                    <Button
                      key={folder.name}
                      type="button"
                      size="sm"
                      variant={folder.name === plan.target ? 'default' : 'outline'}
                      className="h-auto max-w-full py-1 break-all whitespace-normal"
                      onClick={() => update(index, { target: folder.name })}
                    >
                      {folder.name}
                      <span className="opacity-70">{folder.movies} 部</span>
                      {folder.name === plan.target ? <Badge variant="secondary">保留</Badge> : null}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 rounded-xl border p-3">
          <div className="text-sm font-medium">手动合并</div>
          <p className="text-xs text-muted-foreground">
            没找出来的（比如完全不同的译名），搜索后勾选两个以上目录，再加入合并列表。
          </p>
          <Input
            value={filter}
            placeholder="搜索演员目录"
            onChange={event => setFilter(event.target.value)}
          />
          {picked.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {picked.map(name => (
                <Badge key={name} variant="outline" className="break-all">
                  {name}
                </Badge>
              ))}
            </div>
          ) : null}
          {matches.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {matches.map(folder => (
                <li key={folder.name}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={picked.includes(folder.name)}
                      onCheckedChange={checked =>
                        setPicked(current =>
                          checked === true
                            ? [...current, folder.name]
                            : current.filter(name => name !== folder.name)
                        )
                      }
                    />
                    <span className="break-all">{folder.name}</span>
                    <span className="text-xs text-muted-foreground">{folder.movies} 部</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={picked.length < 2}
            onClick={addManual}
          >
            <PlusIcon className="size-4" />
            加入合并列表
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" disabled={selected.length === 0 || merge.isPending} onClick={submit}>
          {merge.isPending ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <MergeIcon className="size-4" />
          )}
          合并选中的 {selected.length} 组
        </Button>
      </DialogFooter>
    </>
  )
}

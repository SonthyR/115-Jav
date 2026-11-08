import { SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useLite } from '@/api/auth'
import type { LibraryFacetKind, LibraryFilter, LibraryProblem, LibrarySort } from '@/api/library'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { FacetFilters } from './facet-filters'

const sortLabels: Record<LibrarySort, string> = {
  added: '最近入库',
  release: '发行日期',
  code: '番号',
  rating: '评分'
}

const watchedLabels = { all: '看过与否', no: '没看过', yes: '看过' } as const

export const problemLabels: Record<LibraryProblem, string> = {
  failed: '刮削失败',
  nocover: '缺封面',
  versions: '多个文件'
}

// Typing waits this long before the listing is filtered.
const searchDelay = 300

export function LibraryFilters({
  filter,
  locked,
  onChange
}: {
  filter: LibraryFilter
  locked?: LibraryFacetKind
  onChange: (filter: LibraryFilter) => void
}) {
  const lite = useLite()
  const [text, setText] = useState(filter.q ?? '')

  useEffect(() => {
    if (text.trim() === (filter.q ?? '')) return
    const timer = setTimeout(
      () => onChange({ ...filter, q: text.trim() || undefined }),
      searchDelay
    )
    return () => clearTimeout(timer)
  }, [text, filter, onChange])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            placeholder="搜索番号、标题或演员"
            className="pl-9"
            onChange={event => setText(event.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch
            checked={!!filter.chinese}
            onCheckedChange={chinese => onChange({ ...filter, chinese: chinese || undefined })}
          />
          只看中字
        </label>
        {lite ? null : (
          <Select
            value={filter.watched ?? 'all'}
            onValueChange={value =>
              onChange({
                ...filter,
                watched: value === 'all' ? undefined : (value as 'yes' | 'no')
              })
            }
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(watchedLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={filter.sort ?? 'added'}
          onValueChange={value =>
            onChange({ ...filter, sort: value === 'added' ? undefined : (value as LibrarySort) })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(sortLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filter.problem ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-warning/15 px-3 py-1 text-warning">
            只看{problemLabels[filter.problem]}的影片
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...filter, problem: undefined })}
          >
            清除
          </Button>
        </div>
      ) : null}
      <FacetFilters filter={filter} locked={locked} onChange={onChange} />
    </div>
  )
}

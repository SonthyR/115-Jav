import { SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { LibraryFilter, LibrarySort } from '@/api/library'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const sortLabels: Record<LibrarySort, string> = {
  added: '最近入库',
  release: '发行日期',
  code: '番号',
  rating: '评分'
}

// Typing waits this long before the listing is filtered.
const searchDelay = 300

export function LibraryFilters({
  filter,
  onChange
}: {
  filter: LibraryFilter
  onChange: (filter: LibraryFilter) => void
}) {
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
  )
}

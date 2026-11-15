import { SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useLite } from '@/api/auth'
import type {
  LibraryFacetKind,
  LibraryFilter,
  LibraryProblem,
  LibrarySort,
  LibraryWatched
} from '@/api/library'
import { cn } from 'cn'
import { ChoiceChip, chipClass, FacetFilters } from './facet-filters'

const sortLabels: Record<LibrarySort, string> = {
  added: '最近入库',
  release: '发行日期',
  code: '番号',
  rating: '评分'
}

const watchedLabels: Record<LibraryWatched | 'all', string> = {
  all: '看过与否',
  no: '没看过',
  yes: '看过'
}

export const problemLabels: Record<LibraryProblem, string> = {
  failed: '刮削失败',
  nocover: '缺封面',
  versions: '多个文件'
}

// Typing waits this long before the listing is filtered.
const searchDelay = 300

// Search, the switches and the facet chips sit in one band between two thin
// lines; on phones the chips scroll sideways instead of stacking up.
export function LibraryFilters({
  filter,
  locked,
  total,
  onChange
}: {
  filter: LibraryFilter
  locked?: LibraryFacetKind
  // How many movies match, once known.
  total?: number
  onChange: (filter: LibraryFilter) => void
}) {
  const lite = useLite()
  const [text, setText] = useState(filter.q ?? '')
  const emitted = useRef(filter.q ?? '')
  const latest = useRef({ filter, onChange })

  useEffect(() => {
    latest.current = { filter, onChange }
  })

  useEffect(() => {
    const q = filter.q ?? ''
    if (q === emitted.current) return
    emitted.current = q
    setText(q)
  }, [filter.q])

  useEffect(() => {
    const q = text.trim()
    if (q === (filter.q ?? '')) return
    const timer = setTimeout(() => {
      emitted.current = q
      const current = latest.current
      current.onChange({ ...current.filter, q: q || undefined })
    }, searchDelay)
    return () => clearTimeout(timer)
  }, [text, filter.q])

  return (
    <div className="space-y-3.5 border-y border-border py-4">
      <div className="flex items-center gap-2.5">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-card/55 px-3.5 transition-colors focus-within:border-foreground/35 sm:h-9 sm:max-w-[340px]">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <input
            value={text}
            placeholder="番号、标题或演员"
            aria-label="在片库里筛选"
            className="min-w-0 flex-1 bg-transparent text-xs tracking-wide outline-none placeholder:text-muted-foreground/75"
            onChange={event => setText(event.target.value)}
          />
        </label>
        <span className="ml-auto shrink-0 font-mono text-[11px] tracking-[0.04em] text-muted-foreground tabular-nums">
          {total === undefined ? null : `共 ${total} 部`}
        </span>
        <ChoiceChip
          plain
          value={filter.sort ?? 'added'}
          choices={sortLabels}
          onChange={sort => onChange({ ...filter, sort: sort === 'added' ? undefined : sort })}
        />
      </div>
      <div className="-mx-4 flex [scrollbar-width:none] items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <button
          type="button"
          aria-pressed={!!filter.chinese}
          className={chipClass(filter.chinese ? 'on' : 'off')}
          onClick={() => onChange({ ...filter, chinese: filter.chinese ? undefined : true })}
        >
          中字
        </button>
        {lite ? null : (
          <ChoiceChip
            value={filter.watched ?? 'all'}
            choices={watchedLabels}
            onChange={watched =>
              onChange({ ...filter, watched: watched === 'all' ? undefined : watched })
            }
          />
        )}
        {filter.problem ? (
          <button
            type="button"
            className={cn(chipClass('picked'), 'border-warning text-warning')}
            title="去掉这个条件"
            onClick={() => onChange({ ...filter, problem: undefined })}
          >
            只看{problemLabels[filter.problem]}
            <XIcon className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
        <span className="mx-1 h-4 w-px shrink-0 bg-foreground/15" />
        <FacetFilters filter={filter} locked={locked} onChange={onChange} />
      </div>
    </div>
  )
}

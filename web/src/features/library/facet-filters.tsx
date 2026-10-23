import { ChevronDownIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import {
  type LibraryFacet,
  type LibraryFacetKind,
  type LibraryFilter,
  useLibraryFacets
} from '@/api/library'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Long lists show this many matches; typing narrows them.
const shownFacets = 200

export const facetLabels: Record<LibraryFacetKind, string> = {
  actor: '演员',
  maker: '厂牌',
  series: '系列',
  tag: '标签',
  year: '年份'
}

const facetLists = {
  actor: 'actors',
  maker: 'makers',
  series: 'series',
  tag: 'tags',
  year: 'years'
} as const

export function FacetFilters({
  filter,
  locked,
  onChange
}: {
  filter: LibraryFilter
  locked?: LibraryFacetKind
  onChange: (filter: LibraryFilter) => void
}) {
  const facets = useLibraryFacets()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(facetLabels) as LibraryFacetKind[])
        .filter(kind => kind !== locked)
        .map(kind => (
          <FacetPicker
            key={kind}
            kind={kind}
            value={filter[kind] === undefined ? undefined : String(filter[kind])}
            options={facets.data?.[facetLists[kind]] ?? []}
            loading={facets.isPending}
            onChange={value =>
              onChange({
                ...filter,
                [kind]: value === undefined ? undefined : kind === 'year' ? Number(value) : value
              })
            }
          />
        ))}
    </div>
  )
}

function FacetPicker({
  kind,
  value,
  options,
  loading,
  onChange
}: {
  kind: LibraryFacetKind
  value?: string
  options: LibraryFacet[]
  loading: boolean
  onChange: (value?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const query = text.trim().toLowerCase()
  const matches = (
    query ? options.filter(item => item.name.toLowerCase().includes(query)) : options
  ).slice(0, shownFacets)

  if (value !== undefined) {
    return (
      <Button variant="secondary" size="sm" className="max-w-60" onClick={() => onChange()}>
        <span className="truncate">
          {facetLabels[kind]}：{value}
        </span>
        <XIcon data-icon="inline-end" />
      </Button>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {facetLabels[kind]}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] space-y-2 p-2">
        {kind !== 'year' ? (
          <Input
            value={text}
            autoFocus
            placeholder={`搜索${facetLabels[kind]}`}
            onChange={event => setText(event.target.value)}
          />
        ) : null}
        <div className="max-h-72 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="p-2 text-muted-foreground">{loading ? '加载中…' : '没有可选的项'}</p>
          ) : (
            matches.map(item => (
              <button
                key={item.name}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => {
                  setOpen(false)
                  setText('')
                  onChange(item.name)
                }}
              >
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

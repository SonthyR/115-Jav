import { ChevronDownIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import {
  type LibraryFacet,
  type LibraryFacetKind,
  type LibraryFilter,
  useLibraryFacets
} from '@/api/library'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from 'cn'

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

// Filter chips: thin outlines, white when switched on, a bright outline when
// a value is picked.
export function chipClass(state: 'off' | 'on' | 'picked' = 'off') {
  return cn(
    'inline-flex h-8 max-w-60 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] tracking-wide whitespace-nowrap outline-ring transition-colors',
    state === 'on' && 'border-foreground bg-foreground text-background',
    state === 'picked' && 'border-foreground text-foreground',
    state === 'off' &&
      'border-foreground/15 text-foreground/80 hover:border-foreground/40 hover:text-foreground data-[state=open]:border-foreground/40'
  )
}

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
    <>
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
    </>
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
      <button
        type="button"
        className={chipClass('picked')}
        title={`去掉${facetLabels[kind]}条件`}
        onClick={() => onChange()}
      >
        <span className="text-muted-foreground">{facetLabels[kind]}</span>
        <span className="truncate">{value}</span>
        <XIcon className="size-3.5 shrink-0" strokeWidth={1.75} />
      </button>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={chipClass()}>
          {facetLabels[kind]}
          <ChevronDownIcon className="size-3.5" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(17rem,calc(100vw-2rem))] space-y-1 p-2">
        {kind !== 'year' ? (
          <Input
            value={text}
            autoFocus
            placeholder={`搜索${facetLabels[kind]}`}
            className="border-0 border-b bg-transparent dark:bg-transparent"
            onChange={event => setText(event.target.value)}
          />
        ) : null}
        <div className="max-h-72 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              {loading ? '加载中…' : '没有可选的项'}
            </p>
          ) : (
            matches.map(item => (
              <button
                key={item.name}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
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

// A chip that picks one of a few choices, such as watched or not.
export function ChoiceChip<T extends string>({
  value,
  choices,
  plain = false,
  onChange
}: {
  value: T
  choices: Record<T, string>
  // Plain chips are bare text, for the sort order at the end of the row.
  plain?: boolean
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const first = Object.keys(choices)[0] as T
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            plain
              ? 'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 text-[13px] tracking-wide text-foreground/80 outline-ring hover:text-foreground'
              : chipClass(value === first ? 'off' : 'picked')
          }
        >
          {choices[value]}
          <ChevronDownIcon className="size-3.5" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align={plain ? 'end' : 'start'} className="w-40 p-1.5">
        {(Object.entries(choices) as Array<[T, string]>).map(([choice, label]) => (
          <button
            key={choice}
            type="button"
            className={cn(
              'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted',
              choice === value && 'text-gold'
            )}
            onClick={() => {
              setOpen(false)
              onChange(choice)
            }}
          >
            {label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

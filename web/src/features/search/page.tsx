import { SearchIcon, XIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useSearchMovies } from '@/api/discover'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import { DISCOVER_PAGE_SIZE } from '@/features/discover/constants'
import { DiscoverResults } from '@/features/discover/results'

export function SearchForm({
  keyword,
  onSearch
}: {
  keyword: string
  onSearch: (keyword: string) => void
}) {
  const [draft, setDraft] = useState(keyword)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(draft.trim())
  }

  return (
    <form className="w-full sm:max-w-[360px]" onSubmit={submit}>
      <InputGroup className="h-10 border-border bg-background/55 shadow-none transition-colors focus-within:border-foreground/35">
        <InputGroupAddon>
          <InputGroupButton type="submit" size="icon-xs">
            <SearchIcon className="size-4" />
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder="搜索番号、标题或演员"
          aria-label="搜索 JavDB"
          className="text-xs tracking-wide placeholder:text-muted-foreground/70"
        />
        {draft ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={() => {
                setDraft('')
                onSearch('')
              }}
            >
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </form>
  )
}

export function SearchResults({
  keyword,
  page,
  onPageChange
}: {
  keyword: string
  page: number
  onPageChange: (page: number) => void
}) {
  const movies = useSearchMovies({ query: keyword, page, limit: DISCOVER_PAGE_SIZE })
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 items-center justify-between gap-4 border-b border-border pb-3">
        <p className="shrink-0 font-mono text-[10px] tracking-[0.18em] text-gold uppercase">
          Search / JavDB
        </p>
        <p className="min-w-0 truncate font-mono text-[11px] tracking-[0.03em] text-muted-foreground">
          「{keyword}」
        </p>
      </div>
      <DiscoverResults
        movies={movies.data}
        loading={movies.isPending}
        fetching={movies.isFetching}
        error={movies.isError}
        searching
        page={page}
        onPageChange={onPageChange}
        onRetry={() => movies.refetch()}
      />
    </div>
  )
}

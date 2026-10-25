import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { apiGet, imageURL } from '@/api/client'
import { type LibraryMovie, libraryKeys, useLibraryFacets } from '@/api/library'
import { cn } from 'cn'
import { ActorPortrait } from './actor-portrait'

// Typing waits this long before suggestions are fetched.
const suggestDelay = 250

// Suggests matching movies and actors while typing; Enter lists every match.
export function WatchSearchBox() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const query = useDebounced(text.trim(), suggestDelay)
  const box = useRef<HTMLFormElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const movies = useQuery({
    queryKey: [...libraryKeys.all, 'suggest', query],
    queryFn: ({ signal }) =>
      apiGet<{ movies: LibraryMovie[] }>(
        '/api/library/movies',
        { page: 1, limit: 6, q: query },
        signal
      ),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000
  })
  const facets = useLibraryFacets()
  const needle = query.toLowerCase()
  const actors = needle
    ? (facets.data?.actors ?? [])
        .filter(
          actor =>
            actor.name.toLowerCase().includes(needle) || actor.alias?.toLowerCase().includes(needle)
        )
        .slice(0, 4)
    : []
  const found = query ? (movies.data?.movies ?? []) : []
  const showing =
    open && query.length > 0 && (found.length > 0 || actors.length > 0 || movies.isFetched)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const finish = () => {
    setOpen(false)
    setText('')
    input.current?.blur()
  }

  return (
    <form
      ref={box}
      role="search"
      className={cn(
        'relative flex min-w-0 items-center rounded-full bg-muted px-3 transition-[width]',
        open ? 'flex-1 sm:w-72 sm:flex-none' : 'w-9 sm:w-56'
      )}
      onSubmit={event => {
        event.preventDefault()
        const q = text.trim()
        finish()
        void navigate({ to: '/browse', search: q ? { q } : {} })
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') finish()
      }}
    >
      <button
        type="button"
        aria-label="搜索"
        className="-ml-0.5 shrink-0 py-2"
        onClick={() => {
          setOpen(true)
          input.current?.focus()
        }}
      >
        <SearchIcon className="size-4 text-muted-foreground" />
      </button>
      <input
        ref={input}
        value={text}
        type="search"
        enterKeyHint="search"
        placeholder="番号、标题、演员"
        className={cn(
          'h-9 min-w-0 flex-1 bg-transparent pl-2 text-sm outline-none [&::-webkit-search-cancel-button]:hidden',
          open ? 'block' : 'hidden sm:block'
        )}
        onFocus={() => setOpen(true)}
        onChange={event => {
          setText(event.target.value)
          setOpen(true)
        }}
      />
      {open && text ? (
        <button
          type="button"
          aria-label="清空"
          className="shrink-0 py-2"
          onClick={() => setText('')}
        >
          <XIcon className="size-4 text-muted-foreground" />
        </button>
      ) : null}

      {showing ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 min-w-72 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
          {actors.length ? (
            <div className="flex gap-1 overflow-x-auto p-1">
              {actors.map(actor => (
                <Link
                  key={actor.name}
                  to="/browse/$kind/$name"
                  params={{ kind: 'actor', name: actor.name }}
                  className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg p-1 text-center hover:bg-muted"
                  onClick={finish}
                >
                  <ActorPortrait
                    name={actor.name}
                    alias={actor.alias}
                    avatar={actor.avatar}
                    className="aspect-square w-12"
                  />
                  <span className="w-full truncate text-xs">{actor.name}</span>
                </Link>
              ))}
            </div>
          ) : null}
          {found.map(movie => (
            <Link
              key={movie.id}
              to="/movie/$id"
              params={{ id: String(movie.id) }}
              className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted"
              onClick={finish}
            >
              <span className="block aspect-2/3 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                {movie.poster || movie.cover ? (
                  <img
                    src={imageURL((movie.poster ?? movie.cover)!)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {movie.title || movie.code}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {movie.code}
                  {movie.actors.length
                    ? ` · ${movie.actors
                        .slice(0, 2)
                        .map(actor => actor.name)
                        .join('、')}`
                    : ''}
                </span>
              </span>
            </Link>
          ))}
          {found.length === 0 && actors.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              没有找到「{query}」
            </p>
          ) : (
            <button
              type="submit"
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              在片库里查看全部结果
            </button>
          )}
        </div>
      ) : null}
    </form>
  )
}

function useDebounced(value: string, delay: number) {
  const [current, setCurrent] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return current
}

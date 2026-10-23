import { Link, useNavigate } from '@tanstack/react-router'
import {
  FolderHeartIcon,
  HomeIcon,
  UsersIcon,
  LibraryIcon,
  SearchIcon,
  WrenchIcon
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { type PropsWithChildren, useState } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { cn } from 'cn'

const NAV_ITEMS: Array<{
  label: string
  icon: LucideIcon
  to: '/' | '/actors' | '/browse' | '/collections'
}> = [
  { label: '首页', icon: HomeIcon, to: '/' },
  { label: '演员', icon: UsersIcon, to: '/actors' },
  { label: '片库', icon: LibraryIcon, to: '/browse' },
  { label: '收藏夹', icon: FolderHeartIcon, to: '/collections' }
]

// Watching needs no task stream or scan controls, which keeps it light on phones.
export function WatchShell({ children }: PropsWithChildren) {
  return (
    <div className="relative min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-3 sm:gap-2 sm:px-4">
          <Link to="/" className="mr-2 hidden text-lg font-bold sm:block">
            看片
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/', includeSearch: false }}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground sm:px-3"
              >
                <item.icon className="size-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
          </nav>
          <SearchBox />
          <Link
            to="/library"
            aria-label="去管理"
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <WrenchIcon className="size-4" />
            <span className="hidden md:inline">管理</span>
          </Link>
        </div>
      </header>
      {children}
      <Toaster position="top-right" closeButton duration={6000} />
    </div>
  )
}

function SearchBox() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  return (
    <form
      className={cn(
        'ml-auto flex items-center rounded-full bg-muted px-3',
        open ? 'flex-1 sm:flex-none' : ''
      )}
      onSubmit={event => {
        event.preventDefault()
        void navigate({ to: '/browse', search: text.trim() ? { q: text.trim() } : {} })
      }}
    >
      <button type="button" aria-label="搜索" className="py-1.5" onClick={() => setOpen(true)}>
        <SearchIcon className="size-4 text-muted-foreground" />
      </button>
      <input
        value={text}
        placeholder="番号、标题、演员"
        className={cn(
          'h-8 bg-transparent pl-2 text-sm outline-none',
          open ? 'w-full sm:w-52' : 'hidden w-52 sm:block'
        )}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={event => setText(event.target.value)}
      />
    </form>
  )
}

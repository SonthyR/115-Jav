import { Link, useLocation } from '@tanstack/react-router'
import { CompassIcon, HomeIcon, LibraryIcon, type LucideIcon, UserRoundIcon } from 'lucide-react'
import type { PropsWithChildren } from 'react'

import { isTaskActive, useTasks } from '@/api/tasks'
import { Toaster } from '@/components/ui/sonner'
import { DownloadIndicator } from '@/features/downloads/download-indicator'
import { TaskEventsProvider } from '@/features/tasks/task-events'
import { TaskNotifications } from '@/features/tasks/task-notifications'
import { WatchSearchBox } from '@/features/watch/search-box'
import { cn } from 'cn'

type Tab = { label: string; to: string }

type Section = {
  label: string
  icon: LucideIcon
  to: string
  // Pages that belong to the section, as path prefixes.
  paths: string[]
  // Sibling pages shown as tabs under the top bar.
  tabs?: Tab[]
}

// Four places cover everything: watching, the library, finding new films and
// the household chores (downloads, sorting, settings).
const SECTIONS: Section[] = [
  { label: '首页', icon: HomeIcon, to: '/', paths: ['/', '/movie'] },
  {
    label: '片库',
    icon: LibraryIcon,
    to: '/browse',
    paths: ['/browse', '/actors', '/collections'],
    tabs: [
      { label: '影片', to: '/browse' },
      { label: '演员', to: '/actors' },
      { label: '收藏夹', to: '/collections' }
    ]
  },
  {
    label: '找片',
    icon: CompassIcon,
    to: '/discover',
    paths: ['/discover', '/search', '/subscriptions'],
    tabs: [
      { label: '发现', to: '/discover' },
      { label: '订阅', to: '/subscriptions' }
    ]
  },
  {
    label: '我的',
    icon: UserRoundIcon,
    to: '/me',
    paths: ['/me', '/organize', '/library', '/settings'],
    tabs: [
      { label: '概览', to: '/me' },
      { label: '下载与整理', to: '/organize' },
      { label: '媒体库', to: '/library' },
      { label: '设置', to: '/settings' }
    ]
  }
]

function within(pathname: string, path: string) {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
}

export function sectionOf(pathname: string) {
  return SECTIONS.find(section => section.paths.some(path => within(pathname, path)))
}

// One layout for every page: a top bar with search and downloads, section
// tabs where a section has several pages, and a tab bar on phones.
export function AppLayout({ children }: PropsWithChildren) {
  const { pathname } = useLocation()
  const current = sectionOf(pathname)
  const busy = useTasks().data?.some(isTaskActive) ?? false
  // Tabs show on the section's own pages, not on a profile or detail below them.
  const tabs = current?.tabs?.some(tab => tab.to === pathname) ? current.tabs : undefined

  return (
    <TaskEventsProvider>
      <div className="relative min-h-dvh pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
            <Link to="/" className="mr-2 shrink-0 text-lg font-black tracking-tight">
              <span className="text-primary">115</span>-JAV
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {SECTIONS.map(section => (
                <Link
                  key={section.to}
                  to={section.to}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                    section === current && 'bg-muted font-medium text-foreground'
                  )}
                >
                  <section.icon className="size-4" />
                  {section.label}
                  {section.to === '/me' && busy ? (
                    <BusyDot className="absolute top-1 right-1" />
                  ) : null}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5">
              <WatchSearchBox />
              <DownloadIndicator />
            </div>
          </div>
          {tabs ? (
            <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
              {tabs.map(tab => (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    'shrink-0 rounded-full border border-transparent px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
                    tab.to === pathname && 'border-border bg-card font-medium text-foreground'
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>
        {children}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
          <ul className="flex">
            {SECTIONS.map(section => (
              <li key={section.to} className="flex-1">
                <Link
                  to={section.to}
                  className={cn(
                    'relative flex h-15 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground',
                    section === current && 'font-medium text-foreground'
                  )}
                >
                  <section.icon
                    className={cn('size-5', section === current && 'text-primary')}
                    strokeWidth={section === current ? 2.4 : 2}
                  />
                  {section.label}
                  {section.to === '/me' && busy ? (
                    <BusyDot className="absolute top-2 right-[calc(50%-16px)]" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <Toaster position="top-right" closeButton duration={6000} />
      <TaskNotifications />
    </TaskEventsProvider>
  )
}

export function BusyDot({ className }: { className?: string }) {
  return (
    <span className={cn('flex size-2', className)} title="有任务在进行">
      <span className="absolute inline-flex size-2 animate-ping rounded-full bg-sky-500 opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
    </span>
  )
}

import { Link, useLocation } from '@tanstack/react-router'
import { CompassIcon, HomeIcon, LayoutGridIcon, type LucideIcon, UserRoundIcon } from 'lucide-react'
import { type PropsWithChildren, useEffect, useState } from 'react'

import { useLite } from '@/api/auth'
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
  { label: '首页', icon: HomeIcon, to: '/', paths: ['/'] },
  {
    label: '片库',
    icon: LayoutGridIcon,
    to: '/browse',
    paths: ['/browse', '/actors', '/collections', '/movie'],
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

function sectionsFor(lite: boolean) {
  return lite ? SECTIONS.filter(section => section.to !== '/') : SECTIONS
}

function sectionOf(pathname: string, lite = false) {
  return sectionsFor(lite).find(section => section.paths.some(path => within(pathname, path)))
}

// One layout for every page: a top bar with search and downloads, section
// tabs where a section has several pages, and a tab bar on phones. On the
// home and movie pages the top bar lies clear over the picture until the page
// scrolls.
export function AppLayout({ children }: PropsWithChildren) {
  const { pathname } = useLocation()
  const lite = useLite()
  const sections = sectionsFor(lite)
  const current = sectionOf(pathname, lite)
  const busy = useTasks().data?.some(isTaskActive) ?? false
  const scrolled = useScrolled()
  // Tabs show on the section's own pages, not on a profile or detail below them.
  const tabs = current?.tabs?.some(tab => tab.to === pathname) ? current.tabs : undefined
  // The home hero and movie covers run up under the bar.
  const clear = (pathname === '/' || pathname.startsWith('/movie/')) && !scrolled

  return (
    <TaskEventsProvider>
      <div className="relative min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <header
          className={cn(
            'sticky top-0 z-30 border-b transition-colors duration-300',
            clear ? 'border-transparent' : 'border-border bg-background/85 backdrop-blur-xl'
          )}
        >
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:grid md:grid-cols-[1fr_auto_1fr]">
            <Link
              to={sections[0]!.to}
              className="shrink-0 text-[15px] font-semibold tracking-[0.14em]"
            >
              115-JAV
            </Link>
            <nav className="hidden items-center gap-9 text-sm md:flex">
              {sections.map(section => (
                <Link
                  key={section.to}
                  to={section.to}
                  className={cn(
                    'relative py-2 tracking-wide text-muted-foreground transition-colors hover:text-foreground',
                    section === current && 'text-foreground'
                  )}
                >
                  {section.label}
                  {section === current ? (
                    <span className="absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-gold" />
                  ) : null}
                  {section.to === '/me' && busy ? (
                    <BusyDot className="absolute top-1 -right-2.5" />
                  ) : null}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 md:ml-0">
              <WatchSearchBox />
              <DownloadIndicator />
            </div>
          </div>
          {tabs ? (
            <nav className="mx-auto flex max-w-6xl [scrollbar-width:none] gap-7 overflow-x-auto px-4">
              {tabs.map(tab => (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    'relative shrink-0 pt-1 pb-3 text-sm tracking-wide text-muted-foreground transition-colors hover:text-foreground',
                    tab.to === pathname &&
                      'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gold'
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>
        {children}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
          <ul className="flex">
            {sections.map(section => (
              <li key={section.to} className="flex-1">
                <Link
                  to={section.to}
                  className={cn(
                    'relative flex h-16 flex-col items-center justify-center gap-1.5 text-[11px] tracking-wider text-muted-foreground',
                    section === current && 'text-foreground'
                  )}
                >
                  <section.icon className="size-[22px]" strokeWidth={1.5} />
                  {section.label}
                  {section.to === '/me' && busy ? (
                    <BusyDot className="absolute top-2.5 right-[calc(50%-16px)]" />
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

function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  return scrolled
}

export function BusyDot({ className }: { className?: string }) {
  return (
    <span className={cn('flex size-2', className)} title="有任务在进行">
      <span className="absolute inline-flex size-2 animate-ping rounded-full bg-gold opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-gold" />
    </span>
  )
}

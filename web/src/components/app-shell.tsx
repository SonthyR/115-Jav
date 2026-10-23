import { Link } from '@tanstack/react-router'
import {
  BellIcon,
  CompassIcon,
  FilmIcon,
  FolderInputIcon,
  type LucideIcon,
  SearchIcon,
  SettingsIcon,
  TvIcon
} from 'lucide-react'
import type { PropsWithChildren } from 'react'

import { isTaskActive, useTasks } from '@/api/tasks'
import { Toaster } from '@/components/ui/sonner'
import { TaskEventsProvider } from '@/features/tasks/task-events'
import { TaskNotifications } from '@/features/tasks/task-notifications'
import { cn } from 'cn'

type NavTo = '/library' | '/organize' | '/subscriptions' | '/discover' | '/search' | '/settings'

type NavItem = { label: string; icon: LucideIcon; to: NavTo }

// Grouped by what the user is doing: tending the library, finding new
// films, or configuring the app.
const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: '媒体库',
    items: [
      { label: '影片', icon: FilmIcon, to: '/library' },
      { label: '整理', icon: FolderInputIcon, to: '/organize' }
    ]
  },
  {
    title: '找片',
    items: [
      { label: '发现', icon: CompassIcon, to: '/discover' },
      { label: '搜索', icon: SearchIcon, to: '/search' },
      { label: '订阅', icon: BellIcon, to: '/subscriptions' }
    ]
  },
  { title: '系统', items: [{ label: '设置', icon: SettingsIcon, to: '/settings' }] }
]

const NAV_ITEMS = NAV_GROUPS.flatMap(group => group.items)

const linkClass =
  'data-[status=active]:bg-primary data-[status=active]:text-primary-foreground data-[status=active]:font-medium'

export function AppShell({ children }: PropsWithChildren) {
  return (
    <TaskEventsProvider>
      <div className="relative min-h-dvh md:pl-56">
        <Sidebar />
        {children}
        <BottomBar />
        <Toaster position="top-right" closeButton duration={6000} />
        <TaskNotifications />
      </div>
    </TaskEventsProvider>
  )
}

// Desktop: a labelled sidebar that is always visible.
function Sidebar() {
  const busy = useLibraryBusy()
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border/70 bg-background md:flex">
      <div className="flex h-16 items-center px-5 text-lg font-bold">管理</div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3">
        {NAV_GROUPS.map(group => (
          <div key={group.title} className="space-y-1">
            <p className="px-3 text-xs text-muted-foreground">{group.title}</p>
            {group.items.map(item => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ includeSearch: false }}
                className={cn(
                  'flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground',
                  linkClass
                )}
              >
                <item.icon className="size-4" />
                <span className="flex-1">{item.label}</span>
                {item.to === '/library' && busy ? <BusyDot /> : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-border/70 p-3">
        <Link
          to="/"
          className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <TvIcon className="size-4" />
          去观看
        </Link>
      </div>
    </aside>
  )
}

// Phones: a tab bar with labels, so every icon says what it opens.
function BottomBar() {
  const busy = useLibraryBusy()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-7">
        <li>
          <Link
            to="/"
            className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground"
          >
            <TvIcon className="size-5" />
            观看
          </Link>
        </li>
        {NAV_ITEMS.map(item => (
          <li key={item.to}>
            <Link
              to={item.to}
              activeOptions={{ includeSearch: false }}
              className="relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
            >
              <item.icon className="size-5" />
              {item.label}
              {item.to === '/library' && busy ? (
                <span className="absolute top-2 right-[calc(50%-14px)]">
                  <BusyDot />
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function BusyDot() {
  return (
    <span className="relative flex size-2" title="有任务在进行">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-500 opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
    </span>
  )
}

function useLibraryBusy() {
  const tasks = useTasks()
  return tasks.data?.some(isTaskActive) ?? false
}

import { Link, type LinkProps, useLocation, useRouter } from '@tanstack/react-router'
import { EllipsisIcon, type LucideIcon, TvIcon, WrenchIcon } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useLastPage } from '@/stores/last-page'
import { cn } from 'cn'

export type NavItem = {
  label: string
  icon: LucideIcon
  to: LinkProps['to']
  // Marks the item, as when a task is running behind it.
  dot?: boolean
  exact?: boolean
}

export type Side = 'watch' | 'manage'

const HOMES: Record<Side, string> = { watch: '/', manage: '/library' }

const MANAGE_PATHS = [
  '/library',
  '/organize',
  '/discover',
  '/search',
  '/subscriptions',
  '/settings'
]

function sideOf(href: string): Side | undefined {
  const pathname = href.split(/[?#]/)[0] ?? ''
  if (pathname.startsWith('/play/')) return undefined
  const manage = MANAGE_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
  return manage ? 'manage' : 'watch'
}

const SIDES: Array<{ side: Side; label: string; icon: LucideIcon }> = [
  { side: 'watch', label: '观看', icon: TvIcon },
  { side: 'manage', label: '管理', icon: WrenchIcon }
]

// Both sides share one layout: a top bar on wide screens, and on phones a
// slim top bar plus a tab bar within thumb reach. Only the items differ.
export function NavShell({
  side,
  items,
  phoneItems = items,
  moreItems = [],
  tools,
  children
}: {
  side: Side
  items: NavItem[]
  // Phones show at most five tabs; the rest go under 更多.
  phoneItems?: NavItem[]
  moreItems?: NavItem[]
  tools?: ReactNode
  children: ReactNode
}) {
  const location = useLocation()
  const remember = useLastPage(state => state.remember)
  // While a switch is loading, the old side still renders with the new
  // location, so only a page of this side is remembered.
  useEffect(() => {
    if (sideOf(location.pathname) === side) remember(side, location.href)
  }, [side, location.pathname, location.href, remember])

  return (
    <div className="relative min-h-dvh pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-4">
          <span className="mr-1 shrink-0 text-base font-bold sm:text-lg">115-Jav</span>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map(item => (
              <Link
                key={String(item.to)}
                to={item.to}
                activeOptions={{ exact: item.exact, includeSearch: false }}
                className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground"
              >
                <item.icon className="size-4" />
                {item.label}
                {item.dot ? <BusyDot /> : null}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
            {tools}
            <SideSwitch side={side} />
          </div>
        </div>
      </header>
      {children}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="flex">
          {phoneItems.map(item => (
            <li key={String(item.to)} className="flex-1">
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact, includeSearch: false }}
                className="relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
              >
                <item.icon className="size-5" />
                {item.label}
                {item.dot ? (
                  <span className="absolute top-2 right-[calc(50%-14px)]">
                    <BusyDot />
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
          {moreItems.length ? (
            <li className="flex-1">
              <MoreMenu items={moreItems} />
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  )
}

// One control on both sides flips between watching and managing, back to
// wherever that side was left.
function SideSwitch({ side }: { side: Side }) {
  const router = useRouter()
  const last = useLastPage()
  return (
    <div className="flex shrink-0 items-center rounded-full bg-muted p-0.5 text-sm">
      {SIDES.map(item => (
        <button
          key={item.side}
          type="button"
          aria-pressed={item.side === side}
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-muted-foreground transition-colors',
            item.side === side
              ? 'bg-background font-medium text-foreground shadow-sm'
              : 'hover:text-foreground'
          )}
          onClick={() => {
            if (item.side === side) return
            const target = last[item.side]
            router.history.push(sideOf(target) === item.side ? target : HOMES[item.side])
          }}
        >
          <item.icon className="size-4" />
          {item.label}
        </button>
      ))}
    </div>
  )
}

function MoreMenu({ items }: { items: NavItem[] }) {
  const location = useLocation()
  const active = items.some(item => location.pathname.startsWith(String(item.to)))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground outline-none',
          active && 'font-medium text-foreground'
        )}
      >
        <EllipsisIcon className="size-5" />
        更多
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-36">
        {items.map(item => (
          <DropdownMenuItem key={String(item.to)} asChild>
            <Link to={item.to}>
              <item.icon />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function BusyDot() {
  return (
    <span className="relative flex size-2" title="有任务在进行">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-500 opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
    </span>
  )
}

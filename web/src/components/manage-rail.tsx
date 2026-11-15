import { Link, useLocation } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  FilmIcon,
  FolderInputIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  type LucideIcon
} from 'lucide-react'

import { cn } from 'cn'

const items: Array<{ label: string; to: string; icon: LucideIcon }> = [
  { label: '概览', to: '/me', icon: LayoutDashboardIcon },
  { label: '下载与整理', to: '/organize', icon: FolderInputIcon },
  { label: '媒体库', to: '/library', icon: FilmIcon },
  { label: '设置', to: '/settings', icon: SettingsIcon }
]

export function ManageRail() {
  const { pathname } = useLocation()

  return (
    <aside className="sticky top-[60px] hidden h-[calc(100dvh-60px)] flex-col border-r border-border bg-background/45 px-3 py-6 md:flex">
      <p className="px-3 pb-3 font-mono text-[10px] tracking-[0.16em] text-muted-foreground/65 uppercase">
        CONTROL ROOM
      </p>
      <nav aria-label="管理导航" className="flex flex-col gap-0.5">
        {items.map(item => {
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`)
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-10 items-center gap-3 rounded-md px-3 text-xs tracking-wide transition-colors',
                active
                  ? 'bg-gold/10 text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-0 w-px rounded-full bg-gold"
                />
              ) : null}
              <item.icon
                className={cn('size-4', active ? 'text-gold' : 'text-muted-foreground/75')}
                strokeWidth={1.5}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto border-t border-border pt-3">
        <Link
          to="/"
          className="flex min-h-10 items-center gap-3 rounded-md px-3 text-xs tracking-wide text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" strokeWidth={1.5} />
          返回观看
        </Link>
      </div>
    </aside>
  )
}

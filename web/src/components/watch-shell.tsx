import { FolderHeartIcon, HomeIcon, LibraryIcon, SparklesIcon, UsersIcon } from 'lucide-react'
import type { PropsWithChildren } from 'react'

import { type NavItem, NavShell } from '@/components/nav-shell'
import { Toaster } from '@/components/ui/sonner'
import { WatchSearchBox } from '@/features/watch/search-box'

const NAV_ITEMS: NavItem[] = [
  { label: '首页', icon: HomeIcon, to: '/', exact: true },
  { label: '演员', icon: UsersIcon, to: '/actors' },
  { label: '片库', icon: LibraryIcon, to: '/browse' },
  { label: '推荐', icon: SparklesIcon, to: '/recommend' },
  { label: '收藏夹', icon: FolderHeartIcon, to: '/collections' }
]

// Watching needs no task stream or scan controls, which keeps it light on phones.
export function WatchShell({ children }: PropsWithChildren) {
  return (
    <>
      <NavShell side="watch" items={NAV_ITEMS} tools={<WatchSearchBox />}>
        {children}
      </NavShell>
      <Toaster position="top-right" closeButton duration={6000} />
    </>
  )
}

import type { PropsWithChildren } from 'react'
import { FolderHeartIcon, HomeIcon, LayoutGridIcon, LibraryIcon, WrenchIcon } from 'lucide-react'

import { FloatingNav, type FloatingNavItem } from '@/components/floating-nav'
import { Toaster } from '@/components/ui/sonner'

const NAV_ITEMS: FloatingNavItem[] = [
  { id: 'home', label: '首页', icon: HomeIcon, to: '/' },
  { id: 'wall', label: '海报墙', icon: LayoutGridIcon, to: '/wall' },
  { id: 'browse', label: '片库', icon: LibraryIcon, to: '/browse' },
  { id: 'collections', label: '收藏夹', icon: FolderHeartIcon, to: '/collections' },
  { id: 'manage', label: '去管理', icon: WrenchIcon, to: '/library' }
]

// Watching needs no task stream or scan controls, which keeps it light on phones.
export function WatchShell({ children }: PropsWithChildren) {
  return (
    <div className="relative min-h-dvh">
      <FloatingNav items={NAV_ITEMS} />
      {children}
      <Toaster position="top-right" closeButton duration={6000} />
    </div>
  )
}

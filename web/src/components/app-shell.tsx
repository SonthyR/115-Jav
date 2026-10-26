import { BellIcon, CompassIcon, FilmIcon, FolderInputIcon, SettingsIcon } from 'lucide-react'
import type { PropsWithChildren } from 'react'

import { isTaskActive, useTasks } from '@/api/tasks'
import { type NavItem, NavShell } from '@/components/nav-shell'
import { Toaster } from '@/components/ui/sonner'
import { TaskEventsProvider } from '@/features/tasks/task-events'
import { TaskNotifications } from '@/features/tasks/task-notifications'

export function AppShell({ children }: PropsWithChildren) {
  return (
    <TaskEventsProvider>
      <ManageNav>{children}</ManageNav>
      <Toaster position="top-right" closeButton duration={6000} />
      <TaskNotifications />
    </TaskEventsProvider>
  )
}

function ManageNav({ children }: PropsWithChildren) {
  const busy = useLibraryBusy()
  const library: NavItem = { label: '影片', icon: FilmIcon, to: '/library', dot: busy }
  const organize: NavItem = { label: '整理', icon: FolderInputIcon, to: '/organize' }
  const discover: NavItem = { label: '发现', icon: CompassIcon, to: '/discover' }
  const subscriptions: NavItem = { label: '订阅', icon: BellIcon, to: '/subscriptions' }
  const settings: NavItem = { label: '设置', icon: SettingsIcon, to: '/settings' }
  return (
    <NavShell
      side="manage"
      items={[library, organize, discover, subscriptions, settings]}
      phoneItems={[library, organize, discover, subscriptions]}
      moreItems={[settings]}
    >
      {children}
    </NavShell>
  )
}

function useLibraryBusy() {
  const tasks = useTasks()
  return tasks.data?.some(isTaskActive) ?? false
}

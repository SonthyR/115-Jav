import { createFileRoute, Outlet } from '@tanstack/react-router'

import { WatchShell } from '@/components/watch-shell'

export const Route = createFileRoute('/_watch')({
  component: () => (
    <WatchShell>
      <Outlet />
    </WatchShell>
  )
})

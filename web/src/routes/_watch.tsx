import { createFileRoute, Outlet } from '@tanstack/react-router'

import { AppLayout } from '@/components/app-layout'

export const Route = createFileRoute('/_watch')({
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
})

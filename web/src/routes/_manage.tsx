import { createFileRoute, Outlet } from '@tanstack/react-router'

import { AppLayout } from '@/components/app-layout'

export const Route = createFileRoute('/_manage')({
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
})

import { createRootRoute, Outlet } from '@tanstack/react-router'

import { AccessGate } from '@/features/access-gate/access-gate'
import { MovieDetailDialogProvider } from '@/features/movie-detail/dialog'

export const Route = createRootRoute({
  component: RootLayout
})

function RootLayout() {
  return (
    <AccessGate>
      <MovieDetailDialogProvider>
        <Outlet />
      </MovieDetailDialogProvider>
    </AccessGate>
  )
}

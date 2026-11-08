import { createFileRoute, Navigate } from '@tanstack/react-router'

import { useLite } from '@/api/auth'
import { WatchHome } from '@/features/watch/home'

export const Route = createFileRoute('/_app/')({
  component: Home
})

// Lite servers have no home page; the library opens instead.
function Home() {
  return useLite() ? <Navigate to="/browse" replace /> : <WatchHome />
}

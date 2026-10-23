import { createFileRoute } from '@tanstack/react-router'

import { WatchHome } from '@/features/watch/home'

export const Route = createFileRoute('/_watch/')({
  component: WatchHome
})

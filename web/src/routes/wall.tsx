import { createFileRoute } from '@tanstack/react-router'

import { WallPage } from '@/features/wall/page'

export const Route = createFileRoute('/wall')({
  component: WallPage
})

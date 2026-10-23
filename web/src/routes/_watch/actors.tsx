import { createFileRoute } from '@tanstack/react-router'

import { ActorsPage } from '@/features/watch/actors-page'

export const Route = createFileRoute('/_watch/actors')({
  component: ActorsPage
})

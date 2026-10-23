import { createFileRoute } from '@tanstack/react-router'

import { CollectionsPage } from '@/features/collections/page'

export const Route = createFileRoute('/collections')({
  component: CollectionsPage
})

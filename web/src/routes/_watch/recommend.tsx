import { createFileRoute } from '@tanstack/react-router'

import { RecommendPage } from '@/features/watch/recommend-page'

export const Route = createFileRoute('/_watch/recommend')({
  component: RecommendPage
})

import { createFileRoute } from '@tanstack/react-router'

import { MePage } from '@/features/me/page'

export const Route = createFileRoute('/_manage/me')({
  component: MePage
})

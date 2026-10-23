import { createFileRoute } from '@tanstack/react-router'

import { OrganizePage } from '@/features/organize/page'

export const Route = createFileRoute('/_manage/organize')({
  component: OrganizePage
})

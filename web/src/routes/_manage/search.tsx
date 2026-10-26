import { createFileRoute, redirect } from '@tanstack/react-router'

import { parseSearchPage } from '@/lib/search-schema'

// Search moved into the discover page; old links and bookmarks land there.
export const Route = createFileRoute('/_manage/search')({
  beforeLoad: ({ search }) => {
    const { q, page } = search as Record<string, unknown>
    const keyword = typeof q === 'string' || typeof q === 'number' ? String(q).trim() : ''
    const searchPage = parseSearchPage(page)
    throw redirect({
      to: '/discover',
      search: keyword ? { q: keyword, ...(searchPage ? { searchPage } : {}) } : {},
      replace: true
    })
  }
})

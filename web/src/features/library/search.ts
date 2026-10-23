import type { LibraryFilter, LibrarySort } from '@/api/library'
import { parseSearchPage } from '@/lib/search-schema'

export type LibrarySearch = LibraryFilter & { page?: number }

const sorts: LibrarySort[] = ['added', 'release', 'code', 'rating']

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : undefined
}

export function parseLibrarySearch(search: Record<string, unknown>): LibrarySearch {
  const result: LibrarySearch = {}
  const page = parseSearchPage(search.page)
  if (page) result.page = page
  const q = text(search.q)
  if (q) result.q = q
  if (search.chinese === true || search.chinese === 'true') result.chinese = true
  if (sorts.includes(search.sort as LibrarySort) && search.sort !== 'added') {
    result.sort = search.sort as LibrarySort
  }
  for (const key of ['actor', 'maker', 'series', 'tag'] as const) {
    const value = text(search[key])
    if (value) result[key] = value
  }
  const year = Number(search.year)
  if (Number.isInteger(year) && year >= 1900 && year <= 2200) result.year = year
  return result
}

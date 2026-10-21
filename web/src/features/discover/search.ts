import type { JavDBZone } from '@/api/discover'
import { parseSearchPage } from '@/lib/search-schema'
import { DISCOVER_SORTS, DISCOVER_ZONES } from './constants'

export type DiscoverView = 'released' | 'upcoming' | 'category'
export type DiscoverSort = 'release' | 'score' | 'want_watch_count' | 'watched_count'
export type CategoryFilters = { zone: JavDBZone; categoryID: string; tagID: string; main: string }
export type DiscoverSearch = Partial<CategoryFilters> & {
  view?: DiscoverView
  sort?: DiscoverSort
  releasedPage?: number
  upcomingPage?: number
  categoryPage?: number
}

export function validateMainSearch(search: Record<string, unknown>): { main?: string } {
  const main = search.main
  if (main === undefined || main === '') return {}
  if (typeof main !== 'string' || !['p', 'm', 'c', 's', 'i', 'v'].includes(main)) {
    throw new Error('通用筛选无效')
  }
  return { main }
}

export function validateDiscoverSearch(search: Record<string, unknown>): DiscoverSearch {
  const { view, sort, zone, categoryID, tagID } = search
  if (view !== undefined && view !== 'released' && view !== 'upcoming' && view !== 'category') {
    throw new Error('浏览类型无效')
  }
  if (sort !== undefined && !DISCOVER_SORTS.some(item => item.value === sort)) {
    throw new Error('排序方式无效')
  }
  if (zone !== undefined && !DISCOVER_ZONES.some(item => item.value === zone)) {
    throw new Error('影片分区无效')
  }
  // The router parses bare numeric query values (for example a year) as numbers.
  const tag = typeof tagID === 'number' && Number.isSafeInteger(tagID) ? String(tagID) : tagID
  if (
    (categoryID !== undefined && typeof categoryID !== 'string') ||
    (tag !== undefined && typeof tag !== 'string')
  ) {
    throw new Error('分类筛选无效')
  }
  return {
    view: view === 'upcoming' || view === 'category' ? view : undefined,
    sort: sort && sort !== 'release' ? (sort as DiscoverSort) : undefined,
    releasedPage: parseSearchPage(search.releasedPage),
    upcomingPage: parseSearchPage(search.upcomingPage),
    categoryPage: parseSearchPage(search.categoryPage),
    zone: zone && zone !== 'censored' ? (zone as JavDBZone) : undefined,
    categoryID: categoryID || undefined,
    tagID: tag || undefined,
    ...validateMainSearch(search)
  }
}

export function categoryFromSearch(search: DiscoverSearch): CategoryFilters {
  return {
    zone: search.zone ?? 'censored',
    categoryID: search.categoryID ?? '',
    tagID: search.tagID ?? '',
    main: search.main ?? ''
  }
}

export function updateSortSearch(search: DiscoverSearch, sort: DiscoverSort): DiscoverSearch {
  return validateDiscoverSearch({ ...search, sort, categoryPage: undefined })
}

export function updateCategorySearch(
  search: DiscoverSearch,
  filters: Partial<CategoryFilters>
): DiscoverSearch {
  return validateDiscoverSearch({ ...search, ...filters, categoryPage: undefined })
}

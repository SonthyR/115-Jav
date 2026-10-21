import type { JavDBZone } from '@/api/discover'
import type { DiscoverSort } from './search'

export const DISCOVER_PAGE_SIZE = 20

export const DISCOVER_ZONES: Array<{ value: JavDBZone; label: string }> = [
  { value: 'censored', label: '有码' },
  { value: 'uncensored', label: '无码' },
  { value: 'fc2', label: 'FC2' },
  { value: 'western', label: '欧美' },
  { value: 'anime', label: '动漫' }
]

export const DISCOVER_SORTS: Array<{ value: DiscoverSort; label: string }> = [
  { value: 'release', label: '发行日期' },
  { value: 'score', label: '评分' },
  { value: 'want_watch_count', label: '想看人数' },
  { value: 'watched_count', label: '看过人数' }
]

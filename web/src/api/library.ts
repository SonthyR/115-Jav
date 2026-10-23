import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query'

import { apiGet, apiPost } from '@/api/client'
import type { DiscoverMovieDetail } from '@/api/discover'
import { movieStateKeys } from '@/api/movie-states'
import { refreshQueries } from '@/api/query-refresh'
import { panKeys, type PanAccountStatus } from '@/api/pan'
import { taskKeys, type LibrarySource, type ScanTask, type Task } from '@/api/tasks'

export const LIBRARY_PAGE_SIZE = 20

export type LibraryEntity = { provider?: string; id?: string; name: string }

export type LibraryMovie = {
  id: number
  code: string
  title: string
  javdb_id?: string
  cover?: string
  poster?: string
  fanart?: string
  release_date?: string
  duration: number
  rating: number
  maker?: LibraryEntity
  series?: LibraryEntity
  director?: LibraryEntity
  actors: LibraryEntity[]
  tags: Array<{ id: number; provider: string; source_id: string; name: string }>
  scrape_status: 'pending' | 'done' | 'failed'
  // Versions or parts of the movie in the library.
  file_count: number
}

type LibraryPage = {
  source?: LibrarySource
  movies: LibraryMovie[]
  total: number
  page: number
  has_more: boolean
}

export const libraryKeys = {
  all: ['library'] as const,
  detail: (id: number) => ['library', 'detail', id] as const,
  movies: (page: number, filter: LibraryFilter = {}) => ['library', 'movies', page, filter] as const
}

export type LibraryMovieDetail = Omit<DiscoverMovieDetail, 'release_status'> & {
  library_id: number
  scrape_status: LibraryMovie['scrape_status']
}

export function useLibraryMovie(id: number) {
  return useQuery({
    queryKey: libraryKeys.detail(id),
    queryFn: ({ signal }) =>
      apiGet<LibraryMovieDetail>(`/api/library/movies/${id}`, undefined, signal)
  })
}

export type LibrarySort = 'added' | 'release' | 'code' | 'rating'

export type LibraryFilter = {
  q?: string
  chinese?: boolean
  sort?: LibrarySort
  actor?: string
  maker?: string
  series?: string
  tag?: string
  year?: number
  collection?: number
}

export type LibraryFacetKind = 'actor' | 'maker' | 'series' | 'tag' | 'year'

// alias is the catalogue's Japanese name when the library uses a translated one.
export type LibraryFacet = { name: string; count: number; avatar?: string; alias?: string }

export type LibraryFacets = Record<
  'actors' | 'makers' | 'series' | 'tags' | 'years',
  LibraryFacet[]
>

export function useLibraryFacets() {
  return useQuery({
    queryKey: [...libraryKeys.all, 'facets'],
    queryFn: ({ signal }) => apiGet<LibraryFacets>('/api/library/facets', undefined, signal),
    staleTime: 60_000
  })
}

export function useLibraryMovies(page: number, filter: LibraryFilter = {}) {
  return useQuery({
    queryKey: libraryKeys.movies(page, filter),
    queryFn: ({ signal }) =>
      apiGet<LibraryPage>(
        '/api/library/movies',
        {
          page,
          limit: LIBRARY_PAGE_SIZE,
          q: filter.q,
          chinese: filter.chinese ? 'true' : undefined,
          sort: filter.sort,
          actor: filter.actor,
          maker: filter.maker,
          series: filter.series,
          tag: filter.tag,
          year: filter.year,
          collection: filter.collection
        },
        signal
      ),
    placeholderData: keepPreviousData
  })
}

export function useStartLibraryScan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rebuild: boolean) =>
      apiPost<ScanTask>(rebuild ? '/api/library/rebuild' : '/api/library/scan'),
    onMutate: () => queryClient.getQueryData<Task[]>(taskKeys.all),
    onSuccess: (task, _rebuild, previous) => {
      cacheScanTask(queryClient, task, previous)
      return refreshQueries(queryClient, taskKeys.all)
    }
  })
}

export function useRescrapeLibraryMovie(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code?: string) => apiPost<ScanTask>(`/api/library/movies/${id}/scrape`, { code }),
    onMutate: () => queryClient.getQueryData<Task[]>(taskKeys.all),
    onSuccess: (task, _code, previous) => {
      cacheScanTask(queryClient, task, previous)
      return refreshQueries(queryClient, libraryKeys.all, taskKeys.all, movieStateKeys.all)
    }
  })
}

function cacheScanTask(queryClient: QueryClient, task: ScanTask, previous: Task[] | undefined) {
  const account = queryClient.getQueryData<PanAccountStatus>(panKeys.account)
  if (
    account &&
    (!account.connected ||
      account.account?.id !== task.source.account_id ||
      account.directory?.id !== task.source.directory.id)
  )
    return
  const state = queryClient.getQueryState(taskKeys.all)
  if ((state?.fetchStatus ?? 'idle') !== 'idle' || state?.data !== previous) return
  queryClient.setQueryData<Task[]>(taskKeys.all, tasks => [
    task,
    ...(tasks ?? []).filter(item => item.id !== task.id)
  ])
}

// The GFriends portrait, cached by the backend; it answers 404 when there is none.
export function actorAvatarURL(name: string) {
  return `/api/actors/avatar?name=${encodeURIComponent(name)}`
}

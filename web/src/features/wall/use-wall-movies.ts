import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { apiGet } from '@/api/client'
import type { LibraryMovie } from '@/api/library'

// The wall loads at most this many movies, a page at a time in the background.
const wallLimit = 1200
const pageSize = 100

type Page = { movies: LibraryMovie[]; total: number; has_more: boolean }

export function useWallMovies(sort: string) {
  const query = useInfiniteQuery({
    queryKey: ['library', 'wall', sort],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      apiGet<Page>('/api/library/movies', { page: pageParam, limit: pageSize, sort }, signal),
    getNextPageParam: (last, pages) =>
      last.has_more && pages.length * pageSize < wallLimit ? pages.length + 1 : undefined
  })
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])
  return query
}

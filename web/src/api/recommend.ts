import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet } from '@/api/client'
import type { DiscoverMovie } from '@/api/discover'

// weight is relative to the heaviest item of its kind; collected and watched
// movies count more than the rest.
export type TasteItem = {
  id: string
  name: string
  count: number
  weight: number
}

export type Taste = {
  movies: number
  actors: TasteItem[]
  tags: TasteItem[]
  makers: TasteItem[]
  series: TasteItem[]
}

export type RecommendSection = {
  kind: 'picks' | 'actor' | 'tag' | 'maker' | 'series'
  id?: string
  name?: string
  title: string
  reason: string
  movies: DiscoverMovie[]
}

export type Recommendations = {
  generated_at: string
  taste: Taste
  sections: RecommendSection[]
}

const recommendationsKey = ['recommendations'] as const

// The server keeps a result for hours; building one reads a few dozen JavDB pages.
export function useRecommendations() {
  return useQuery({
    queryKey: recommendationsKey,
    queryFn: ({ signal }) => apiGet<Recommendations>('/api/recommendations', undefined, signal),
    staleTime: 10 * 60_000,
    retry: false
  })
}

export function useRefreshRecommendations() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiGet<Recommendations>('/api/recommendations', { refresh: 'true' }),
    onSuccess: result => queryClient.setQueryData(recommendationsKey, result)
  })
}

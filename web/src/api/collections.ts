import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/client'
import { libraryKeys } from '@/api/library'

export type Collection = { id: number; name: string; count: number; cover?: string }

export const collectionKeys = {
  all: ['collections'] as const,
  movie: (id: number) => ['collections', 'movie', id] as const
}

export function useCollections() {
  return useQuery({
    queryKey: collectionKeys.all,
    queryFn: ({ signal }) => apiGet<Collection[]>('/api/collections', undefined, signal)
  })
}

export function useMovieCollections(movieID: number) {
  return useQuery({
    queryKey: collectionKeys.movie(movieID),
    queryFn: ({ signal }) =>
      apiGet<number[]>(`/api/library/movies/${movieID}/collections`, undefined, signal)
  })
}

function useCollectionMutation<T, R>(mutationFn: (input: T) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: collectionKeys.all }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.all })
      ])
  })
}

export function useCreateCollection() {
  return useCollectionMutation((name: string) => apiPost<Collection>('/api/collections', { name }))
}

export function useRenameCollection() {
  return useCollectionMutation(({ id, name }: { id: number; name: string }) =>
    apiPatch(`/api/collections/${id}`, { name })
  )
}

export function useDeleteCollection() {
  return useCollectionMutation((id: number) => apiDelete(`/api/collections/${id}`))
}

export function useToggleCollection(movieID: number) {
  return useCollectionMutation(({ id, member }: { id: number; member: boolean }) =>
    member
      ? apiPut(`/api/collections/${id}/movies/${movieID}`, {})
      : apiDelete(`/api/collections/${id}/movies/${movieID}`)
  )
}

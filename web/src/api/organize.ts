import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet, apiPost, apiPut } from '@/api/client'

export type OrganizeFolder = {
  id: string
  path: string
}

export type OrganizeRule = {
  enabled: boolean
  dry_run: boolean
  source: OrganizeFolder
  failed: OrganizeFolder
}

export type OrganizeConfig = {
  rules: OrganizeRule[] | null
  max_actors: number
  min_video_mb: number
  clean_junk: boolean
  // Absent in configurations saved before it; the backend treats that as on.
  title_code?: boolean
}

export type OrganizeEntry = {
  time: string
  source: string
  code?: string
  target?: string
  status: 'done' | 'dry_run' | 'failed' | 'info'
  detail?: string
}

export const organizeKeys = {
  config: ['settings', 'organize'] as const,
  log: ['organize', 'log'] as const
}

export function useOrganizeConfig() {
  return useQuery({
    queryKey: organizeKeys.config,
    queryFn: ({ signal }) => apiGet<OrganizeConfig>('/api/settings/organize', undefined, signal),
    staleTime: 15_000
  })
}

export function useUpdateOrganizeConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: OrganizeConfig) =>
      apiPut<OrganizeConfig>('/api/settings/organize', config),
    onSuccess: config => queryClient.setQueryData(organizeKeys.config, config)
  })
}

export function useOrganizeLog(enabled: boolean) {
  return useQuery({
    queryKey: organizeKeys.log,
    queryFn: ({ signal }) => apiGet<OrganizeEntry[]>('/api/organize/log', undefined, signal),
    enabled,
    refetchInterval: enabled ? 5_000 : false
  })
}

export function useRunOrganize() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<{ started: boolean }>('/api/organize/run'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: organizeKeys.log })
  })
}

export type ActorFolder = {
  name: string
  movies: number
}

export type ActorGroup = {
  folders: ActorFolder[]
  suggested: string
  // The folder named as JavDB names the actor, when one is.
  catalogue?: string
}

export type ActorFolders = {
  groups: ActorGroup[]
  folders: ActorFolder[]
}

export type ActorMerge = {
  target: string
  sources: string[]
}

export function useActorFolders(enabled: boolean) {
  return useQuery({
    queryKey: ['organize', 'actors'] as const,
    queryFn: ({ signal }) => apiGet<ActorFolders>('/api/organize/actors', undefined, signal),
    enabled,
    staleTime: 0
  })
}

export function useMergeActors() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (merges: ActorMerge[]) =>
      apiPost<{ started: boolean }>('/api/organize/actors/merge', { merges }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizeKeys.log })
      void queryClient.invalidateQueries({ queryKey: ['organize', 'actors'] })
    }
  })
}

export type FailedItem = {
  name: string
  folder: string
  code?: string
  reason?: string
}

export function useFailedItems() {
  return useQuery({
    queryKey: ['organize', 'failed'] as const,
    queryFn: ({ signal }) => apiGet<FailedItem[]>('/api/organize/failed', undefined, signal),
    staleTime: 0
  })
}

export function useRetryOrganize() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: { name: string; code: string }) =>
      apiPost<OrganizeEntry>('/api/organize/retry', request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizeKeys.log })
      void queryClient.invalidateQueries({ queryKey: ['organize', 'failed'] })
    }
  })
}

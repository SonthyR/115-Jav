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

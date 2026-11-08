import {
  mutationOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query'

import { apiGet, apiPost } from '@/api/client'

export type AccessGateConfig = {
  enabled: boolean
  authenticated: boolean
  // The server runs without web playback and the Emby server API.
  lite?: boolean
}

export type LoginResponse = {
  success: boolean
}

export const authKeys = {
  config: ['auth', 'config'] as const
}

export function useAccessGateConfig() {
  return useQuery({
    queryKey: authKeys.config,
    queryFn: ({ signal }) => apiGet<AccessGateConfig>('/api/auth/config', undefined, signal),
    staleTime: 60_000
  })
}

// Lite servers hide everything that plays a movie in the browser.
export function useLite() {
  return useAccessGateConfig().data?.lite === true
}

export function accessGateLoginOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: (password: string) => apiPost<LoginResponse>('/api/auth/login', { password }),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: authKeys.config })
      queryClient.setQueryData<AccessGateConfig>(authKeys.config, previous => ({
        ...previous,
        enabled: true,
        authenticated: true
      }))
    }
  })
}

export function useAccessGateLogin() {
  return useMutation(accessGateLoginOptions(useQueryClient()))
}

import {
  mutationOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query'

import { apiGet, apiPost } from '@/api/client'

export type JavDBAccount = {
  configured: boolean
  logged_in: boolean
  username: string
}

export type JavDBCredentials = {
  username: string
  password: string
}

export const javdbKeys = {
  account: ['settings', 'javdb'] as const
}

export function useJavDBAccount() {
  return useQuery({
    queryKey: javdbKeys.account,
    queryFn: ({ signal }) => apiGet<JavDBAccount>('/api/settings/javdb', undefined, signal),
    staleTime: 15_000
  })
}

export function loginJavDBOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: (credentials: JavDBCredentials) =>
      apiPost<JavDBAccount>('/api/settings/javdb', credentials),
    onSuccess: account => {
      queryClient.setQueryData(javdbKeys.account, account)
    }
  })
}

export function useLoginJavDB() {
  return useMutation(loginJavDBOptions(useQueryClient()))
}

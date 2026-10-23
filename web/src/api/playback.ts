import { useQuery } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPut } from '@/api/client'
import type { LibraryMovie } from '@/api/library'

export type PlayFile = { file_id: string; name: string; size: number }

export type PlaySubtitle = { id: number; name: string; language: string; format: string }

export type PlayProgress = {
  file_id: string
  position: number
  duration: number
  updated_at: string
}

export type PlayInfo = {
  files: PlayFile[]
  subtitles: PlaySubtitle[]
  progress?: PlayProgress
}

export type TranscodeSource = { height: number; definition: number; url: string }

export type SubtitleSearchResult = {
  index: number
  name: string
  provider: string
  language: string
  format: string
}

export type ContinueItem = { movie: LibraryMovie; progress: PlayProgress }

export const playbackKeys = {
  info: (id: number) => ['library', 'play', id] as const,
  continue: ['library', 'continue'] as const
}

export function usePlayInfo(id: number) {
  return useQuery({
    queryKey: playbackKeys.info(id),
    queryFn: ({ signal }) => apiGet<PlayInfo>(`/api/library/movies/${id}/play`, undefined, signal),
    staleTime: 0
  })
}

export function useContinueWatching() {
  return useQuery({
    queryKey: playbackKeys.continue,
    queryFn: ({ signal }) => apiGet<ContinueItem[]>('/api/library/continue', undefined, signal)
  })
}

// The same STRM relay that Emby uses: it redirects to the original 115 file.
export function streamURL(fileID: string) {
  return `/api/play/file/${encodeURIComponent(fileID)}`
}

export function fetchTranscodes(fileID: string) {
  return apiGet<TranscodeSource[]>(`/api/play/file/${encodeURIComponent(fileID)}/transcodes`)
}

export function subtitleURL(movieID: number, subtitleID: number) {
  return `/api/library/movies/${movieID}/subtitles/${subtitleID}`
}

export function searchSubtitles(movieID: number) {
  return apiGet<SubtitleSearchResult[]>(`/api/library/movies/${movieID}/subtitle-search`)
}

export async function fetchSubtitle(movieID: number, index: number) {
  const response = await fetch(`/api/library/movies/${movieID}/subtitle-search/${index}`, {
    credentials: 'same-origin'
  })
  if (!response.ok) throw new Error('下载字幕失败')
  return response.text()
}

export function saveProgress(movieID: number, progress: Omit<PlayProgress, 'updated_at'>) {
  return apiPut<void>(`/api/library/movies/${movieID}/progress`, progress)
}

// Leaving the page cancels ordinary requests; keepalive lets the last position arrive.
export function saveProgressOnExit(movieID: number, progress: Omit<PlayProgress, 'updated_at'>) {
  void fetch(`/api/library/movies/${movieID}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
    credentials: 'same-origin',
    keepalive: true
  })
}

export function clearProgress(movieID: number) {
  return apiDelete<void>(`/api/library/movies/${movieID}/progress`)
}

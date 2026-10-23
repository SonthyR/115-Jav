import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SubtitleStyle = {
  size: number
  color: string
  background: number
  // Percent of the video height between the subtitle and the bottom edge.
  offset: number
}

export const defaultSubtitleStyle: SubtitleStyle = {
  size: 100,
  color: '#ffffff',
  background: 0.5,
  offset: 8
}

type SubtitleStyleState = SubtitleStyle & {
  update: (style: Partial<SubtitleStyle>) => void
  reset: () => void
}

export const useSubtitleStyle = create<SubtitleStyleState>()(
  persist(
    set => ({
      ...defaultSubtitleStyle,
      update: style => set(style),
      reset: () => set(defaultSubtitleStyle)
    }),
    { name: 'miyabi-subtitle-style' }
  )
)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

// The chosen speed carries over to the next video and the next visit.
type PlaybackRateState = {
  rate: number
  set: (rate: number) => void
  // Moves one step up or down the list of rates.
  step: (direction: 1 | -1) => void
}

export const usePlaybackRate = create<PlaybackRateState>()(
  persist(
    (set, get) => ({
      rate: 1,
      set: rate => set({ rate }),
      step: direction => {
        const index = playbackRates.findIndex(rate => rate >= get().rate)
        const next =
          playbackRates[Math.min(playbackRates.length - 1, Math.max(0, index + direction))]
        set({ rate: next ?? 1 })
      }
    }),
    { name: 'miyabi-playback-rate' }
  )
)

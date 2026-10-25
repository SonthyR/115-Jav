import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// The volume carries over to the next video and the next visit.
type PlayerVolumeState = {
  volume: number
  muted: boolean
  set: (volume: number, muted: boolean) => void
}

export const usePlayerVolume = create<PlayerVolumeState>()(
  persist(
    set => ({
      volume: 1,
      muted: false,
      set: (volume, muted) => set({ volume, muted })
    }),
    { name: 'miyabi-player-volume' }
  )
)

import { create } from 'zustand'

// A collection playing in order; each movie's player opens the next one
// when its last video ends.
type PlaylistState = {
  ids: number[]
  start: (ids: number[]) => void
  next: (current: number) => number | undefined
  clear: () => void
}

export const usePlaylist = create<PlaylistState>()((set, get) => ({
  ids: [],
  start: ids => set({ ids }),
  next: current => {
    const { ids } = get()
    const index = ids.indexOf(current)
    return index >= 0 ? ids[index + 1] : undefined
  },
  clear: () => set({ ids: [] })
}))

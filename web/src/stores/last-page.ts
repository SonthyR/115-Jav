import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Where each side was last left, so switching between watching and
// managing returns to that page instead of the side's front page.
type LastPageState = {
  watch: string
  manage: string
  remember: (side: 'watch' | 'manage', href: string) => void
}

export const useLastPage = create<LastPageState>()(
  persist(
    set => ({
      watch: '/',
      manage: '/library',
      remember: (side, href) => set({ [side]: href })
    }),
    { name: 'miyabi-last-page' }
  )
)

import type { ReactNode } from 'react'

export function MovieGridLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-5">
      {children}
    </div>
  )
}

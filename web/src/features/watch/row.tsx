import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// A titled row that scrolls sideways, as on a streaming home page.
export function Row({
  title,
  to,
  children
}: {
  title: string
  to?: '/browse' | '/collections'
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {to ? (
          <Link
            to={to}
            className="flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            全部
            <ChevronRightIcon className="size-4" />
          </Link>
        ) : null}
      </div>
      <div className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2">
        {children}
      </div>
    </section>
  )
}

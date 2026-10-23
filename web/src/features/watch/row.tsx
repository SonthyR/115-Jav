import { Link, type LinkProps } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// A titled row that scrolls sideways, as on a streaming home page.
export function Row({
  title,
  link,
  action,
  children
}: {
  title: string
  // Where 全部 leads, usually the library with this row's filter.
  link?: Pick<LinkProps, 'to' | 'search' | 'params'>
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {link ? (
            <Link
              {...link}
              className="flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              全部
              <ChevronRightIcon className="size-4" />
            </Link>
          ) : null}
        </div>
      </div>
      <div className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2">
        {children}
      </div>
    </section>
  )
}

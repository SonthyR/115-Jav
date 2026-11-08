import type { ReactNode } from 'react'

import { cn } from 'cn'

type PageHeaderProps = {
  title: string
  description: string
  children?: ReactNode
  inlineActions?: boolean
}

export function PageHeader({
  title,
  description,
  children,
  inlineActions = false
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col items-start justify-between gap-4 sm:flex-row',
        inlineActions ? 'flex-row' : null
      )}
    >
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-3xl font-semibold tracking-wide sm:text-4xl">{title}</h1>
        <p className="text-sm tracking-wide text-muted-foreground max-sm:hidden">{description}</p>
      </div>
      {children ? (
        <div className="flex max-w-full flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </header>
  )
}

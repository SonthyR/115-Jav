import type { OrganizeEntry } from '@/api/organize'
import { Badge } from '@/components/ui/badge'

export const statusLabels: Record<OrganizeEntry['status'], string> = {
  done: '已整理',
  dry_run: '演练',
  failed: '失败',
  info: '提示'
}

const statusVariants = {
  done: 'success',
  dry_run: 'secondary',
  failed: 'destructive',
  info: 'outline'
} as const

export function OrganizeLogList({ entries }: { entries: OrganizeEntry[] }) {
  return (
    <ul className="min-w-0 border-t border-border">
      {entries.map((entry, index) => (
        <li
          key={`${entry.time}-${index}`}
          className="grid min-w-0 gap-2 border-b border-border py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6"
        >
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariants[entry.status]}>{statusLabels[entry.status]}</Badge>
              <span className="font-mono text-xs font-medium">{entry.code || '—'}</span>
            </div>
            {entry.source ? (
              <p className="font-mono text-[10px] leading-5 break-all text-muted-foreground">
                {entry.source}
              </p>
            ) : null}
            {entry.target ? (
              <p className="font-mono text-[10px] leading-5 break-all text-foreground/80">
                → {entry.target}
              </p>
            ) : null}
            {entry.detail ? (
              <p className="text-[11px] leading-5 break-all text-muted-foreground">
                {entry.detail}
              </p>
            ) : null}
          </div>
          <time
            dateTime={entry.time}
            className="font-mono text-[10px] text-muted-foreground/70 tabular-nums md:text-right"
          >
            {new Date(entry.time).toLocaleString()}
          </time>
        </li>
      ))}
    </ul>
  )
}

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
    <ul className="min-w-0 space-y-3">
      {entries.map((entry, index) => (
        <li key={`${entry.time}-${index}`} className="min-w-0 space-y-1 rounded-xl border p-3">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant={statusVariants[entry.status]}>{statusLabels[entry.status]}</Badge>
            <span className="font-medium">{entry.code || '—'}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {new Date(entry.time).toLocaleString()}
            </span>
          </div>
          {entry.source ? (
            <div className="text-xs break-all text-muted-foreground">{entry.source}</div>
          ) : null}
          {entry.target ? <div className="text-xs break-all">→ {entry.target}</div> : null}
          {entry.detail ? (
            <div className="text-xs break-all text-muted-foreground">{entry.detail}</div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

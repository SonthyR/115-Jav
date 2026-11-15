import type { NamedEntity } from '@/api/discover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export const filterSelectClass =
  'h-10 w-auto min-w-32 shrink-0 rounded-full border-border bg-card/50 px-3.5 text-xs tracking-wide text-foreground transition-colors hover:border-foreground/30 sm:h-9'

export function CommonFilterSelect({
  options,
  value,
  onValueChange
}: {
  options: NamedEntity[]
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <Select
      value={value || 'all'}
      onValueChange={next => onValueChange(next === 'all' ? '' : next)}
    >
      <SelectTrigger className={filterSelectClass}>
        <SelectValue placeholder="全部条件" />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>
          <SelectItem value="all">全部条件</SelectItem>
          {options.map(option => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

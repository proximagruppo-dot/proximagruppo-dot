import { ArrowDown, ArrowUp, ChevronDown, X } from 'lucide-react'

import { Button } from '@admin/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@admin/components/ui/dropdown-menu'
import type { ResourceColumn } from '@admin/config/resources'

export interface SortState {
  field: string
  order: 'asc' | 'desc'
}

export function SortMenu({
  columns,
  sort,
  onChange,
  onClear,
}: {
  columns: ResourceColumn[]
  sort: SortState | null
  onChange: (sort: SortState) => void
  onClear: () => void
}) {
  const current = sort ? columns.find((c) => c.key === sort.field) : undefined
  const label = sort
    ? `Sort: ${current?.label ?? sort.field} (${sort.order === 'asc' ? 'Ascending' : 'Descending'})`
    : 'Sort'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            {sort?.order === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            {label}
            <ChevronDown className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
        <DropdownMenuItem onClick={onClear}>
          <X className="size-3.5" />
          Clear
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {columns.map((col) => (
          <div key={col.key}>
            <DropdownMenuItem onClick={() => onChange({ field: col.key, order: 'asc' })}>
              <ArrowUp className="size-3.5" />
              {col.label} · {col.numeric ? '0 → 9' : 'A → Z'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChange({ field: col.key, order: 'desc' })}>
              <ArrowDown className="size-3.5" />
              {col.label} · {col.numeric ? '9 → 0' : 'Z → A'}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

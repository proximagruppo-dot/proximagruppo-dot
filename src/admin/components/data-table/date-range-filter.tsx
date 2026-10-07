import { CalendarDays, X } from 'lucide-react'

import { Button } from '@admin/components/ui/button'
import { Input } from '@admin/components/ui/input'
import { Label } from '@admin/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@admin/components/ui/popover'

export interface DateRange {
  from: string
  to: string
}

export function DateRangeFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: DateRange
  onChange: (value: DateRange) => void
}) {
  const active = Boolean(value.from || value.to)
  const summary = active ? `${value.from || '…'} → ${value.to || '…'}` : `${label} from → to`

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant={active ? 'default' : 'outline'} size="sm" className="gap-1.5">
            <CalendarDays className="size-3.5" />
            {summary}
          </Button>
        }
      />
      <PopoverContent className="w-64" align="start">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="range-from" className="text-xs">
              From
            </Label>
            <Input
              id="range-from"
              type="date"
              value={value.from}
              className="h-8 text-sm"
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="range-to" className="text-xs">
              To
            </Label>
            <Input
              id="range-to"
              type="date"
              value={value.to}
              className="h-8 text-sm"
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </div>
          {active && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onChange({ from: '', to: '' })}>
              <X className="size-3.5" />
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

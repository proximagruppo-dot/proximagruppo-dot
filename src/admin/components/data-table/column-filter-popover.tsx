import { Filter, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@admin/components/ui/button'
import { Checkbox } from '@admin/components/ui/checkbox'
import { Input } from '@admin/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@admin/components/ui/popover'

export function ColumnFilterPopover({
  label,
  options,
  selectedValues,
  loading,
  onChange,
}: {
  label: string
  options: string[]
  selectedValues: string[]
  loading?: boolean
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [temp, setTemp] = useState<string[]>(selectedValues)

  useEffect(() => {
    if (!open) setTemp(selectedValues)
  }, [selectedValues, open])

  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next)
        if (next) setTemp(selectedValues)
        else setSearch('')
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant={selectedValues.length > 0 ? 'default' : 'ghost'}
            size="icon"
            className="size-6"
            aria-label={`Filter ${label}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Filter className="size-3" />
          </Button>
        }
      />
      <PopoverContent className="w-60" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 text-xs font-medium">Filter {label}</div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-7 text-sm"
          />
        </div>
        <div className="mb-2 max-h-[220px] space-y-1 overflow-y-auto">
          {loading ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length > 0 ? (
            filtered.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={temp.includes(option)}
                  onCheckedChange={(checked: boolean) =>
                    setTemp((prev) => (checked ? [...prev, option] : prev.filter((v) => v !== option)))
                  }
                />
                <span className="truncate">{option}</span>
              </label>
            ))
          ) : (
            <p className="px-1 py-2 text-sm text-muted-foreground">No options</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              onChange(temp)
              setOpen(false)
            }}
          >
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTemp([])
              onChange([])
              setOpen(false)
            }}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

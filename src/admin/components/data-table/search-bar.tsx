import { Search, X } from 'lucide-react'

import { Button } from '@admin/components/ui/button'
import { Input } from '@admin/components/ui/input'

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative w-[280px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 pr-8 text-sm"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0.5 top-1/2 size-7 -translate-y-1/2"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

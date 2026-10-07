import { Pencil, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@admin/components/ui/button'
import { Sheet, SheetClose, SheetContent } from '@admin/components/ui/sheet'
import { formatColumnTitle, formatDateTime, isDateLikeColumn } from '@admin/lib/formatters'
import { cn } from '@admin/lib/utils'

function ExpandableValue({ text, mono }: { text: string; mono?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > 400
  return (
    <div>
      <p className={cn('whitespace-pre-wrap break-words', mono && 'font-mono text-xs')}>
        {expanded || !isLong ? text : `${text.slice(0, 400)}...`}
      </p>
      {isLong && (
        <button
          type="button"
          className="mt-1 text-xs text-primary hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function renderValue(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">-</span>
  }
  if (typeof value === 'boolean') return <span>{value ? '✅' : '❌'}</span>
  if (typeof value === 'number') return <span className="tabular-nums">{String(value)}</span>
  if (typeof value === 'string') {
    if (isDateLikeColumn(field)) return <span>{formatDateTime(value)}</span>
    return <ExpandableValue text={value} />
  }
  let json: string
  try {
    json = JSON.stringify(value, null, 2)
  } catch {
    json = String(value)
  }
  return <ExpandableValue text={json} mono />
}

/** The right-hand panel opened by the eye icon or by clicking a row. Shows the
 *  raw record -- every column the row actually has, not just the visible ones. */
export function QuickViewSheet({
  open,
  onOpenChange,
  tableLabel,
  record,
  recordId,
  editable,
  onEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tableLabel: string
  // Held by the caller through the close transition so the panel doesn't flash
  // to "no record" while it is still visibly sliding out.
  record: Record<string, unknown> | undefined
  recordId: string | null
  editable: boolean
  onEdit: () => void
}) {
  const primary = record && (record.email ?? record.lamp_name ?? record.full_name ?? record.mac_address)
  const title = recordId
    ? primary
      ? `${String(primary)} (${recordId})`
      : `${tableLabel} (${recordId})`
    : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="flex w-full flex-col gap-0 sm:max-w-[520px]">
        <div className="flex items-center justify-between gap-2 border-b p-4">
          <div className="flex min-w-0 items-center gap-2">
            <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
              <X className="size-4" />
            </SheetClose>
            <h2 className="truncate text-base font-medium">{title}</h2>
          </div>
          {editable && (
            <Button variant="ghost" size="icon-sm" title="Edit" aria-label="Edit" onClick={onEdit}>
              <Pencil className="size-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {!record ? (
            <p className="text-sm text-destructive">Failed to load record.</p>
          ) : (
            Object.keys(record).map((field) => (
              <div key={field} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">{formatColumnTitle(field)}</span>
                <div className="text-sm">{renderValue(record[field], field)}</div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

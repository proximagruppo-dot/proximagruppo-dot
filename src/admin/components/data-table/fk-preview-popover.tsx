import { useState } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@admin/components/ui/popover'
import { supabaseClient } from '@admin/lib/supabase'
import { formatColumnTitle } from '@admin/lib/formatters'

/** Hovering/clicking a foreign key shows the referenced record without leaving
 *  the table. The record is fetched only when the popover is first opened --
 *  a table full of these must not fan out into a request per visible row. */
export function FkPreviewPopover({
  targetResource,
  targetIdField,
  recordId,
  children,
}: {
  targetResource: string
  targetIdField: string
  recordId: string | number
  children: React.ReactNode
}) {
  const [record, setRecord] = useState<Record<string, unknown> | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle')

  const load = async () => {
    if (state !== 'idle') return
    setState('loading')
    const { data, error } = await supabaseClient
      .from(targetResource)
      .select('*')
      .eq(targetIdField, recordId)
      .maybeSingle()
    if (error || !data) {
      setState('error')
      return
    }
    setRecord(data as Record<string, unknown>)
    setState('ready')
  }

  return (
    <Popover onOpenChange={(open: boolean) => open && load()}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="cursor-pointer text-left underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          {formatColumnTitle(targetResource)} · {String(recordId)}
        </div>
        {state === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
        {state === 'error' && <p className="text-sm text-destructive">Could not load record.</p>}
        {state === 'ready' && record && (
          <dl className="flex flex-col gap-1.5">
            {Object.entries(record)
              .slice(0, 10)
              .map(([key, value]) => (
                <div key={key} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2 text-sm">
                  <dt className="truncate text-xs text-muted-foreground">{formatColumnTitle(key)}</dt>
                  <dd className="truncate">{value === null || value === undefined ? '-' : String(value)}</dd>
                </div>
              ))}
          </dl>
        )}
      </PopoverContent>
    </Popover>
  )
}

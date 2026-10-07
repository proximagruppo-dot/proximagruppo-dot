import { Filter, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@admin/components/ui/button'
import { Input } from '@admin/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@admin/components/ui/select'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@admin/components/ui/sheet'
import { isDateLikeColumn } from '@admin/lib/formatters'
import { cn } from '@admin/lib/utils'
import type { ResourceColumn } from '@admin/config/resources'

export interface FilterCondition {
  id: string
  field: string
  operator: string
  value: string
}

export interface AdvancedFilter {
  logic: 'and' | 'or'
  conditions: FilterCondition[]
}

export const EMPTY_ADVANCED_FILTER: AdvancedFilter = { logic: 'and', conditions: [] }

interface SavedFilter {
  name: string
  logic: 'and' | 'or'
  conditions: Omit<FilterCondition, 'id'>[]
}

/** Operator sets per detected field type. The values are PostgREST operator
 *  names, so a condition maps straight onto a Supabase filter with no
 *  translation layer. */
const OPERATORS_BY_TYPE: Record<string, { label: string; value: string }[]> = {
  text: [
    { label: 'contains', value: 'contains' },
    { label: 'equals', value: 'eq' },
    { label: 'not equals', value: 'ne' },
    { label: 'starts with', value: 'startswith' },
    { label: 'is empty', value: 'null' },
  ],
  number: [
    { label: 'equals', value: 'eq' },
    { label: 'not equals', value: 'ne' },
    { label: 'greater than', value: 'gt' },
    { label: 'less than', value: 'lt' },
    { label: 'greater or equal', value: 'gte' },
    { label: 'less or equal', value: 'lte' },
  ],
  date: [
    { label: 'after', value: 'gte' },
    { label: 'before', value: 'lte' },
  ],
  boolean: [{ label: 'is', value: 'eq' }],
}

function detectFieldType(column: ResourceColumn | undefined, field: string): string {
  if (!column && !field) return 'text'
  if (isDateLikeColumn(field)) return 'date'
  if (column?.numeric) return 'number'
  if (/^(id|count|amount|price|quantity|total|num_|.*_id)$/i.test(field)) return 'number'
  if (/^(is_|has_|can_|active|enabled|verified|visible)/i.test(field)) return 'boolean'
  return 'text'
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

export function AdvancedFilterSheet({
  open,
  onOpenChange,
  tableKey,
  columns,
  value,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tableKey: string
  columns: ResourceColumn[]
  value: AdvancedFilter
  onApply: (filter: AdvancedFilter) => void
}) {
  const [logic, setLogic] = useState<'and' | 'or'>(value.logic)
  const [conditions, setConditions] = useState<FilterCondition[]>(value.conditions)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [saveName, setSaveName] = useState('')

  const storageKey = `proxima-admin:saved-filters:${tableKey}`

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      setSavedFilters(stored ? JSON.parse(stored) : [])
    } catch {
      setSavedFilters([])
    }
  }, [storageKey])

  /** The operator list depends on the field type, so a new row has to pick the
   *  first operator valid for ITS field -- hardcoding 'contains' put a date
   *  column into a text operator it does not support. */
  const blankCondition = (): FilterCondition => {
    const column = columns[0]
    const field = column?.key ?? ''
    const ops = OPERATORS_BY_TYPE[detectFieldType(column, field)] ?? OPERATORS_BY_TYPE.text
    return { id: makeId(), field, operator: ops[0].value, value: '' }
  }

  useEffect(() => {
    if (!open) return
    setLogic(value.logic)
    setConditions(value.conditions.length > 0 ? value.conditions : [blankCondition()])
    // Only re-seed when the sheet opens, not on every keystroke in the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const updateCondition = (id: string, patch: Partial<FilterCondition>) => {
    setConditions((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const updated = { ...c, ...patch }
        if (patch.field && patch.field !== c.field) {
          const column = columns.find((col) => col.key === patch.field)
          const ops = OPERATORS_BY_TYPE[detectFieldType(column, patch.field)] ?? OPERATORS_BY_TYPE.text
          updated.operator = ops[0].value
          updated.value = ''
        }
        return updated
      })
    )
  }

  const handleApply = () => {
    // `null` ("is empty") is the one operator that needs no value.
    const valid = conditions.filter((c) => c.field && c.operator && (c.value !== '' || c.operator === 'null'))
    onApply({ logic, conditions: valid })
    onOpenChange(false)
  }

  const handleClear = () => {
    setConditions([])
    onApply(EMPTY_ADVANCED_FILTER)
    onOpenChange(false)
  }

  const persistSaved = (next: SavedFilter[]) => {
    setSavedFilters(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Non-fatal: the filter still applies, it just won't be remembered.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Advanced Filters</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">Match</span>
            <div className="inline-flex rounded-md border p-0.5">
              {(['and', 'or'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLogic(l)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    logic === l ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  {l === 'and' ? 'All (AND)' : 'Any (OR)'}
                </button>
              ))}
            </div>
            <span className="text-sm">conditions</span>
          </div>

          <div className="flex flex-col gap-2">
            {conditions.map((cond) => {
              const column = columns.find((c) => c.key === cond.field)
              const fieldType = detectFieldType(column, cond.field)
              const operators = OPERATORS_BY_TYPE[fieldType] ?? OPERATORS_BY_TYPE.text

              return (
                <div key={cond.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
                  <Select value={cond.field} onValueChange={(v: string | null) => v && updateCondition(cond.id, { field: v })}>
                    <SelectTrigger className="h-8 w-[140px] text-sm">
                      {/* Render the label explicitly: the bare <SelectValue /> shows the
                          stored value, which is the raw column key (`logged_at`). */}
                      <SelectValue>{column?.label ?? cond.field}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col.key} value={col.key}>
                          {col.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={cond.operator}
                    onValueChange={(v: string | null) => v && updateCondition(cond.id, { operator: v })}
                  >
                    <SelectTrigger className="h-8 w-[140px] text-sm">
                      <SelectValue>
                        {operators.find((o) => o.value === cond.operator)?.label ?? cond.operator}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {operators.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {cond.operator === 'null' ? (
                    <span className="w-[140px] text-xs text-muted-foreground">no value needed</span>
                  ) : fieldType === 'boolean' ? (
                    <Select value={cond.value} onValueChange={(v: string | null) => v && updateCondition(cond.id, { value: v })}>
                      <SelectTrigger className="h-8 w-[140px] text-sm">
                        <SelectValue placeholder="Value" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">True</SelectItem>
                        <SelectItem value="false">False</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={fieldType === 'date' ? 'date' : fieldType === 'number' ? 'number' : 'text'}
                      value={cond.value}
                      onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                      placeholder="Value"
                      className="h-8 w-[140px] text-sm"
                    />
                  )}

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    aria-label="Remove condition"
                    onClick={() => setConditions((prev) => prev.filter((c) => c.id !== cond.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>

          <Button
            variant="outline"
            className="border-dashed"
            onClick={() => setConditions((prev) => [...prev, blankCondition()])}
          >
            <Plus className="size-4" />
            Add condition
          </Button>

          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-semibold">Saved Filters</p>
            <div className="mb-2 flex gap-2">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Filter name"
                className="h-8 w-[200px] text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!saveName.trim() || conditions.length === 0}
                onClick={() => {
                  persistSaved([
                    ...savedFilters,
                    {
                      name: saveName.trim(),
                      logic,
                      conditions: conditions.map(({ field, operator, value: v }) => ({ field, operator, value: v })),
                    },
                  ])
                  setSaveName('')
                }}
              >
                <Save className="size-3.5" />
                Save
              </Button>
            </div>
            {savedFilters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved filters</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {savedFilters.map((f, i) => (
                  <button
                    key={`${f.name}-${i}`}
                    onClick={() => {
                      setLogic(f.logic)
                      setConditions(f.conditions.map((c) => ({ ...c, id: makeId() })))
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    {f.name} ({f.conditions.length})
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Delete saved filter ${f.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        persistSaved(savedFilters.filter((_, index) => index !== i))
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleClear}>
            Clear
          </Button>
          <Button size="sm" onClick={handleApply}>
            <Filter className="size-3.5" />
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

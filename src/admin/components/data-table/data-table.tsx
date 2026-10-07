import { useDelete, useTable, type CrudFilters } from '@refinedev/core'
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Eye,
  FileDown,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@admin/components/ui/alert-dialog'
import { Badge } from '@admin/components/ui/badge'
import { Button } from '@admin/components/ui/button'
import { Checkbox } from '@admin/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@admin/components/ui/table'
import {
  AdvancedFilterSheet,
  EMPTY_ADVANCED_FILTER,
  type AdvancedFilter,
} from '@admin/components/data-table/advanced-filter-sheet'
import { BulkActions } from '@admin/components/data-table/bulk-actions'
import { ColumnFilterPopover } from '@admin/components/data-table/column-filter-popover'
import { DataTableCell } from '@admin/components/data-table/table-cell'
import { DataTableSkeleton } from '@admin/components/data-table/data-table-skeleton'
import { DateRangeFilter, type DateRange } from '@admin/components/data-table/date-range-filter'
import { OptionsSheet, type ListOptionsView } from '@admin/components/data-table/options-sheet'
import { QuickViewSheet } from '@admin/components/data-table/quick-view-sheet'
import { SearchBar } from '@admin/components/data-table/search-bar'
import { SortMenu, type SortState } from '@admin/components/data-table/sort-menu'
import { getResource, type ResourceColumn } from '@admin/config/resources'
import { isDateLikeColumn } from '@admin/lib/formatters'
import { exportCsv, exportJson, printRows, type ExportFormat, type ExportMode } from '@admin/lib/export'
import { supabaseClient } from '@admin/lib/supabase'
import { useColumnOptions } from '@admin/lib/use-column-options'
import { useColumnWidths } from '@admin/lib/use-column-widths'
import { useRelationLabels } from '@admin/lib/use-relation-labels'
import { DENSITY_CELL_CLASS, useTableDensity } from '@admin/lib/use-table-density'
import { useVisibleColumns } from '@admin/lib/use-visible-columns'
import { cn } from '@admin/lib/utils'

const PAGE_SIZES = [25, 50, 100]
const AUTO_REFRESH_MS = 15_000
const SEARCH_DEBOUNCE_MS = 300

/** PostgREST refuses to return more than its `max-rows` per response (1000
 *  here), silently, so every bulk read has to be paged in chunks of that size. */
const FETCH_PAGE_SIZE = 1000
const EXPORT_LIMIT = 50_000

const CHECKBOX_WIDTH = 44
const ID_WIDTH = 92
const ACTIONS_WIDTH = 108
const DEFAULT_COLUMN_WIDTH = 170
const MIN_COLUMN_WIDTH = 60

/** Sensible starting widths by column shape, so the common case reads without
 *  anyone having to drag a resize handle first. A full timestamp does not fit
 *  in 170px and was being truncated to "10/7/2026, 3:46:54 ...". */
function defaultWidthFor(column: ResourceColumn): number {
  if (isDateLikeColumn(column.key)) return 215
  if (column.numeric) return 110
  if (column.key === 'message' || column.key === 'note') return 340
  return DEFAULT_COLUMN_WIDTH
}

/** A drag handle on a column's trailing edge. Pointer capture keeps the drag
 *  alive even when the pointer leaves the 6px strip. */
function ResizeHandle({ onResize }: { onResize: (deltaX: number) => void }) {
  const lastX = useRef(0)
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/50 active:bg-primary"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        lastX.current = e.clientX
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.style.cursor = 'col-resize'
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        const delta = e.clientX - lastX.current
        if (delta === 0) return
        lastX.current = e.clientX
        onResize(delta)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        document.body.style.cursor = ''
      }}
    />
  )
}

/** `resourceName` is normally taken from the `:resource` route segment; the
 *  prop is there so a page can embed a specific table directly. */
export function DataTable({ resourceName: resourceProp }: { resourceName?: string }) {
  const params = useParams<{ resource: string }>()
  const resourceName = resourceProp ?? params.resource ?? ''
  const resource = getResource(resourceName)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({})
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilter>(EMPTY_ADVANCED_FILTER)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [optionsView, setOptionsView] = useState<ListOptionsView>('main')
  const [quickViewId, setQuickViewId] = useState<string | null>(null)
  const [quickViewOpen, setQuickViewOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [jsonPretty, setJsonPretty] = useState(true)
  const [showRelations, setShowRelations] = useState(true)

  const tableKey = resource?.name ?? resourceName
  const idField = resource?.idField ?? 'id'
  const allColumnKeys = useMemo(() => resource?.columns.map((c) => c.key) ?? [], [resource])

  const { density, setDensity } = useTableDensity()
  const { columnWidths, setColumnWidth, resetColumnWidths } = useColumnWidths(tableKey)
  const { visibleColumns, toggleColumn, showAllColumns } = useVisibleColumns(tableKey, allColumnKeys, idField)

  // Every piece of per-resource state resets when the route changes, or a
  // filter from `users` would be re-applied against `lamp_log`'s columns.
  useEffect(() => {
    setSearch('')
    setDebouncedSearch('')
    setColumnFilters({})
    setDateRange({ from: '', to: '' })
    setAdvancedFilter(EMPTY_ADVANCED_FILTER)
    setSelected(new Set())
    setPageSize(PAGE_SIZES[0])
  }, [resourceName])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [search])

  const filters = useMemo<CrudFilters>(() => {
    if (!resource) return []
    const result: CrudFilters = []

    if (debouncedSearch.trim() && resource.searchFields.length > 0) {
      result.push({
        operator: 'or',
        value: resource.searchFields.map((field) => ({
          field,
          operator: 'contains' as const,
          value: debouncedSearch.trim(),
        })),
      })
    }

    for (const [field, values] of Object.entries(columnFilters)) {
      if (values.length > 0) result.push({ field, operator: 'in', value: values })
    }

    if (resource.dateField) {
      if (dateRange.from) result.push({ field: resource.dateField, operator: 'gte', value: dateRange.from })
      // `to` is a date with no time, so include the whole of that day rather
      // than cutting it off at 00:00 and silently dropping a day's rows.
      if (dateRange.to) {
        result.push({ field: resource.dateField, operator: 'lte', value: `${dateRange.to}T23:59:59.999Z` })
      }
    }

    const advanced = advancedFilter.conditions.map((c) => ({
      field: c.field,
      operator: (c.operator === 'null' ? 'null' : c.operator) as never,
      value: c.operator === 'null' ? true : c.value,
    }))
    if (advanced.length > 0) {
      // AND is the default for sibling filters; OR has to be one grouped filter.
      if (advancedFilter.logic === 'or') result.push({ operator: 'or', value: advanced as never })
      else result.push(...(advanced as never[]))
    }

    return result
  }, [resource, debouncedSearch, columnFilters, dateRange, advancedFilter])

  const { result, tableQuery, currentPage, setCurrentPage, pageCount, sorters, setSorters } = useTable({
    resource: resourceName,
    sorters: { initial: resource ? [resource.defaultSort] : [] },
    filters: { permanent: filters },
    pagination: { pageSize },
  })

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => tableQuery.refetch(), AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [autoRefresh, tableQuery])

  const rows = useMemo(() => (result.data ?? []) as Record<string, unknown>[], [result.data])
  const total = result.total ?? 0

  const { mutateAsync: deleteOne } = useDelete()

  // One request per relation for the whole page, not one per cell.
  const userRelation = resource?.relations?.find((r) => r.targetResource === 'users')
  const otherRelation = resource?.relations?.find((r) => r.targetResource !== 'users')
  const userLabelFor = useRelationLabels(
    userRelation?.targetResource,
    userRelation?.labelField,
    userRelation?.targetIdField ?? 'id',
    userRelation ? rows.map((r) => r[userRelation.sourceField]) : []
  )
  const otherLabelFor = useRelationLabels(
    otherRelation?.targetResource,
    otherRelation?.labelField,
    otherRelation?.targetIdField ?? 'id',
    otherRelation ? rows.map((r) => r[otherRelation.sourceField]) : []
  )

  const shownColumns = useMemo(
    () => (resource?.columns ?? []).filter((c) => visibleColumns.includes(c.key)),
    [resource, visibleColumns]
  )

  const activeSort: SortState | null = sorters[0]
    ? { field: sorters[0].field, order: sorters[0].order as 'asc' | 'desc' }
    : null

  const activeFilterCount =
    Object.values(columnFilters).filter((v) => v.length > 0).length +
    (debouncedSearch.trim() ? 1 : 0) +
    (dateRange.from || dateRange.to ? 1 : 0) +
    advancedFilter.conditions.length

  const clearAll = () => {
    setSearch('')
    setDebouncedSearch('')
    setColumnFilters({})
    setDateRange({ from: '', to: '' })
    setAdvancedFilter(EMPTY_ADVANCED_FILTER)
  }

  const toggleSort = (field: string) => {
    const current = sorters.find((s) => s.field === field)
    setSorters([{ field, order: current?.order === 'asc' ? 'desc' : 'asc' }])
  }

  const widthOf = (column: ResourceColumn) => columnWidths[column.key] ?? defaultWidthFor(column)
  const resizeBy = (column: ResourceColumn, delta: number) =>
    setColumnWidth(column.key, Math.max(MIN_COLUMN_WIDTH, widthOf(column) + delta))

  /** Applies every active filter to a raw Supabase query, so exports and bulk
   *  reads see exactly the rows the table is showing. */
  const applyFilters = useCallback(
    // The Supabase builder's generics change on each call, so the chain is
    // threaded through `any` here rather than re-deriving PostgrestFilterBuilder.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (input: any) => {
      let query = input
      if (!resource) return query
      if (debouncedSearch.trim() && resource.searchFields.length > 0) {
        query = query.or(resource.searchFields.map((f) => `${f}.ilike.%${debouncedSearch.trim()}%`).join(','))
      }
      for (const [field, values] of Object.entries(columnFilters)) {
        if (values.length > 0) query = query.in(field, values)
      }
      if (resource.dateField) {
        if (dateRange.from) query = query.gte(resource.dateField, dateRange.from)
        if (dateRange.to) query = query.lte(resource.dateField, `${dateRange.to}T23:59:59.999Z`)
      }
      for (const c of advancedFilter.conditions) {
        if (c.operator === 'null') query = query.is(c.field, null)
        else if (c.operator === 'contains') query = query.ilike(c.field, `%${c.value}%`)
        else if (c.operator === 'startswith') query = query.ilike(c.field, `${c.value}%`)
        else if (c.operator === 'ne') query = query.neq(c.field, c.value)
        else query = query[c.operator](c.field, c.value)
      }
      return query
    },
    /* eslint-enable @typescript-eslint/no-explicit-any */
    [resource, debouncedSearch, columnFilters, dateRange, advancedFilter]
  )

  /** Reads every row matching the current filters, paging around max-rows. */
  const fetchAllFiltered = useCallback(async (): Promise<Record<string, unknown>[]> => {
    if (!resource) return []
    const order = activeSort ?? resource.defaultSort
    const out: Record<string, unknown>[] = []
    let offset = 0
    for (;;) {
      const query = applyFilters(supabaseClient.from(resource.name).select('*'))
        .order(order.field, { ascending: order.order === 'asc' })
        .range(offset, offset + FETCH_PAGE_SIZE - 1)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      const page = (data ?? []) as Record<string, unknown>[]
      out.push(...page)
      offset += page.length
      if (page.length < FETCH_PAGE_SIZE || out.length >= EXPORT_LIMIT) break
    }
    return out.slice(0, EXPORT_LIMIT)
  }, [resource, activeSort, applyFilters])

  const handleExport = async (format: ExportFormat, mode: ExportMode) => {
    if (!resource) return
    setBusy(true)
    try {
      const data =
        mode === 'visible'
          ? rows
          : mode === 'selected'
            ? rows.filter((r) => selected.has(String(r[idField])))
            : await fetchAllFiltered()

      const columns = shownColumns.map((c) => ({ key: c.key, label: c.label }))
      const stamp = new Date().toISOString().slice(0, 10)

      if (format === 'csv') exportCsv(`${resource.name}-${stamp}.csv`, columns, data)
      else if (format === 'json') exportJson(`${resource.name}-${stamp}.json`, columns, data, jsonPretty)
      else printRows(resource.label, columns, data)

      if (mode === 'all' && data.length >= EXPORT_LIMIT) {
        window.alert(
          `Export capped at ${EXPORT_LIMIT.toLocaleString()} rows of ${total.toLocaleString()}. Narrow the filters to get the rest.`
        )
      }
      setOptionsOpen(false)
    } catch (err) {
      window.alert(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  const removeRecords = async (ids: string[]) => {
    setBusy(true)
    try {
      for (const id of ids) {
        await deleteOne({ resource: resourceName, id })
      }
      setSelected(new Set())
      await tableQuery.refetch()
    } catch (err) {
      window.alert(`Delete failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setBusy(false)
      setPendingDelete(null)
    }
  }

  const openQuickView = (id: string) => {
    setQuickViewId(id)
    setQuickViewOpen(true)
  }

  const handleQuickViewOpenChange = (open: boolean) => {
    setQuickViewOpen(open)
    // Keep the id through the slide-out so the panel doesn't flash empty.
    if (!open) {
      const closing = quickViewId
      window.setTimeout(() => setQuickViewId((cur) => (cur === closing ? null : cur)), 200)
    }
  }

  if (!resource) return <div className="p-6 text-sm text-muted-foreground">Unknown resource.</div>

  const writable = resource.writable === true
  const pageIds = rows.map((r) => String(r[idField]))
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const cellPad = DENSITY_CELL_CLASS[density]
  const quickViewRecord = rows.find((r) => String(r[idField]) === quickViewId)

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b px-6 pb-3 pt-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{resource.label}</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} {total === 1 ? 'record' : 'records'}
            {activeFilterCount > 0 && ' (filtered)'} — search, filters, sort and export run server-side.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {resource.name}
        </Badge>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={`Search ${resource.searchFields.join(', ')}…`}
        />

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={clearAll}>
            <X className="size-3.5" />
            Clear {activeFilterCount}
          </Button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <BulkActions
            selectedCount={selected.size}
            deletable={writable}
            onDelete={() => removeRecords([...selected])}
            onClearSelection={() => setSelected(new Set())}
          />

          {resource.dateField && (
            <DateRangeFilter
              label={resource.columns.find((c) => c.key === resource.dateField)?.label ?? 'Date'}
              value={dateRange}
              onChange={setDateRange}
            />
          )}

          <SortMenu
            columns={resource.columns}
            sort={activeSort}
            onChange={(s) => setSorters([s])}
            onClear={() => setSorters([resource.defaultSort])}
          />

          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdvancedOpen(true)}>
            <SlidersHorizontal className="size-3.5" />
            Advanced
            {advancedFilter.conditions.length > 0 && (
              <Badge className="ml-0.5 h-4 px-1 text-[10px]">{advancedFilter.conditions.length}</Badge>
            )}
          </Button>

          {writable && (
            <Button size="sm" className="gap-1.5" disabled title="Create is not wired up yet">
              <Plus className="size-3.5" />
              Create
            </Button>
          )}

          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setAutoRefresh((v) => !v)}
            title={`Auto-refresh every ${AUTO_REFRESH_MS / 1000}s`}
          >
            <RotateCcw className={cn('size-3.5', autoRefresh && 'animate-spin')} />
            {autoRefresh ? 'Live' : 'Auto'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => tableQuery.refetch()}
            disabled={tableQuery.isFetching}
          >
            {tableQuery.isFetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setOptionsView('main')
              setOptionsOpen(true)
            }}
          >
            <FileDown className="size-3.5" />
            Options
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {tableQuery.isLoading ? (
          <DataTableSkeleton columns={Math.min(shownColumns.length + 2, 8)} />
        ) : tableQuery.isError ? (
          <div className="p-6 text-sm text-destructive">
            Could not load {resource.label}: {tableQuery.error?.message ?? 'unknown error'}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No {resource.label.toLowerCase()} match these filters.
          </div>
        ) : (
          <Table style={{ width: 'max-content', minWidth: '100%' }}>
            <TableHeader className="sticky top-0 z-30 bg-background">
              <TableRow>
                <TableHead
                  className="sticky left-0 z-40 bg-background"
                  style={{ width: CHECKBOX_WIDTH, minWidth: CHECKBOX_WIDTH }}
                >
                  <Checkbox
                    aria-label="Select all rows on this page"
                    checked={allOnPageSelected}
                    onCheckedChange={(checked: boolean) =>
                      setSelected((prev) => {
                        const next = new Set(prev)
                        for (const id of pageIds) {
                          if (checked) next.add(id)
                          else next.delete(id)
                        }
                        return next
                      })
                    }
                  />
                </TableHead>

                <TableHead
                  className="sticky z-40 bg-background"
                  style={{ left: CHECKBOX_WIDTH, width: ID_WIDTH, minWidth: ID_WIDTH }}
                >
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort(idField)}
                  >
                    ID
                    {activeSort?.field === idField &&
                      (activeSort.order === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </button>
                </TableHead>

                {shownColumns.map((col) => (
                  <ColumnHeader
                    key={col.key}
                    column={col}
                    resourceName={resource.name}
                    width={widthOf(col)}
                    sort={activeSort}
                    selectedValues={columnFilters[col.key] ?? []}
                    onSort={() => toggleSort(col.key)}
                    onFilterChange={(values) => setColumnFilters((prev) => ({ ...prev, [col.key]: values }))}
                    onResize={(delta) => resizeBy(col, delta)}
                  />
                ))}

                <TableHead
                  className="sticky right-0 z-40 bg-background text-right"
                  style={{ width: ACTIONS_WIDTH, minWidth: ACTIONS_WIDTH }}
                >
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => {
                const id = String(row[idField])
                const isSelected = selected.has(id)
                return (
                  <TableRow
                    key={id}
                    data-state={isSelected ? 'selected' : undefined}
                    className="cursor-pointer"
                    onClick={(e) => {
                      // Don't hijack clicks that landed on a control.
                      if ((e.target as HTMLElement).closest('button,input,a,[role="button"]')) return
                      openQuickView(id)
                    }}
                  >
                    <TableCell
                      className={cn('sticky left-0 z-20 bg-background', cellPad)}
                      style={{ width: CHECKBOX_WIDTH, minWidth: CHECKBOX_WIDTH }}
                    >
                      <Checkbox
                        aria-label={`Select row ${id}`}
                        checked={isSelected}
                        onCheckedChange={(checked: boolean) =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (checked) next.add(id)
                            else next.delete(id)
                            return next
                          })
                        }
                      />
                    </TableCell>

                    <TableCell
                      className={cn('sticky z-20 bg-background font-mono text-xs', cellPad)}
                      style={{ left: CHECKBOX_WIDTH, width: ID_WIDTH, minWidth: ID_WIDTH }}
                    >
                      {id}
                    </TableCell>

                    {shownColumns.map((col) => {
                      const relation = resource.relations?.find((r) => r.sourceField === col.key)
                      const label = relation
                        ? relation.targetResource === 'users'
                          ? userLabelFor(row[col.key])
                          : otherLabelFor(row[col.key])
                        : undefined
                      return (
                        <TableCell
                          key={col.key}
                          className={cn('align-top', cellPad)}
                          style={{ width: widthOf(col), maxWidth: widthOf(col) }}
                        >
                          <div className="truncate">
                            <DataTableCell
                              value={row[col.key]}
                              column={col}
                              relation={relation}
                              relationLabel={label}
                              showRelations={showRelations}
                            />
                          </div>
                        </TableCell>
                      )
                    })}

                    <TableCell
                      className={cn('sticky right-0 z-20 bg-background', cellPad)}
                      style={{ width: ACTIONS_WIDTH, minWidth: ACTIONS_WIDTH }}
                    >
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Quick view"
                          aria-label="Quick view"
                          onClick={() => openQuickView(id)}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        {writable && (
                          <>
                            <Button variant="ghost" size="icon-sm" title="Edit" aria-label="Edit" disabled>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive"
                              title="Delete"
                              aria-label="Delete"
                              onClick={() => setPendingDelete(id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Page {currentPage} of {Math.max(1, pageCount)}
          </span>
          <span className="text-border">|</span>
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => {
                setPageSize(size)
                setCurrentPage(1)
              }}
              className={cn(
                'rounded px-2 py-0.5 text-xs transition-colors',
                pageSize === size ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
            >
              {size}
            </button>
          ))}
          {selected.size > 0 && <span className="ml-2">{selected.size} selected</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(currentPage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount}
            onClick={() => setCurrentPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <AdvancedFilterSheet
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        tableKey={tableKey}
        columns={resource.columns}
        value={advancedFilter}
        onApply={setAdvancedFilter}
      />

      <OptionsSheet
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        view={optionsView}
        onViewChange={setOptionsView}
        columns={resource.columns}
        visibleColumns={visibleColumns}
        idField={idField}
        onToggleColumn={toggleColumn}
        onShowAllColumns={showAllColumns}
        density={density}
        onDensityChange={setDensity}
        showRelations={showRelations}
        onShowRelationsChange={setShowRelations}
        relationsSupported={(resource.relations?.length ?? 0) > 0}
        onResetColumnWidths={resetColumnWidths}
        visibleCount={rows.length}
        filteredCount={total}
        selectedCount={selected.size}
        jsonPretty={jsonPretty}
        onJsonPrettyChange={setJsonPretty}
        onExport={handleExport}
      />

      <QuickViewSheet
        open={quickViewOpen}
        onOpenChange={handleQuickViewOpenChange}
        tableLabel={resource.label}
        record={quickViewRecord}
        recordId={quickViewId}
        editable={writable}
        onEdit={() => undefined}
      />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open: boolean) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {resource.label} #{pendingDelete}. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => pendingDelete && removeRecords([pendingDelete])}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ColumnHeader({
  column,
  resourceName,
  width,
  sort,
  selectedValues,
  onSort,
  onFilterChange,
  onResize,
}: {
  column: ResourceColumn
  resourceName: string
  width: number
  sort: SortState | null
  selectedValues: string[]
  onSort: () => void
  onFilterChange: (values: string[]) => void
  onResize: (delta: number) => void
}) {
  const { options, loading } = useColumnOptions(
    resourceName,
    column.key,
    column.filterable ? column.options : []
  )

  return (
    <TableHead className="relative" style={{ width, minWidth: width }}>
      <div className="flex items-center gap-1 pr-2">
        <button type="button" className="flex items-center gap-1 truncate hover:text-foreground" onClick={onSort}>
          {column.label}
          {sort?.field === column.key &&
            (sort.order === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
          {sort?.field !== column.key && <ChevronsUpDown className="size-3 opacity-25" />}
        </button>
        {column.filterable && (
          <ColumnFilterPopover
            label={column.label}
            options={options}
            selectedValues={selectedValues}
            loading={loading}
            onChange={onFilterChange}
          />
        )}
      </div>
      <ResizeHandle onResize={onResize} />
    </TableHead>
  )
}

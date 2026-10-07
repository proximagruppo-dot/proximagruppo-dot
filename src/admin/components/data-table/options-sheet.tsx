import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@admin/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@admin/components/ui/sheet'
import { Switch } from '@admin/components/ui/switch'
import {
  ExportViews,
  isExportOptionsView,
  type ExportOptionsView,
} from '@admin/components/data-table/export-views'
import type { ExportFormat, ExportMode } from '@admin/lib/export'
import type { TableDensity } from '@admin/lib/use-table-density'
import { cn } from '@admin/lib/utils'
import type { ResourceColumn } from '@admin/config/resources'

export type ListOptionsView = 'main' | 'columns' | 'density' | ExportOptionsView

export function OptionsSheet({
  open,
  onOpenChange,
  view,
  onViewChange,
  columns,
  visibleColumns,
  idField,
  onToggleColumn,
  onShowAllColumns,
  density,
  onDensityChange,
  showRelations,
  onShowRelationsChange,
  relationsSupported,
  onResetColumnWidths,
  visibleCount,
  filteredCount,
  selectedCount,
  jsonPretty,
  onJsonPrettyChange,
  onExport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  view: ListOptionsView
  onViewChange: (view: ListOptionsView) => void
  columns: ResourceColumn[]
  visibleColumns: string[]
  idField: string
  onToggleColumn: (column: string, visible: boolean) => void
  onShowAllColumns: () => void
  density: TableDensity
  onDensityChange: (next: TableDensity) => void
  showRelations: boolean
  onShowRelationsChange: (next: boolean) => void
  relationsSupported: boolean
  onResetColumnWidths: () => void
  visibleCount: number
  filteredCount: number
  selectedCount: number
  jsonPretty: boolean
  onJsonPrettyChange: (value: boolean) => void
  onExport: (format: ExportFormat, mode: ExportMode) => void
}) {
  const hiddenCount = Math.max(0, columns.length - visibleColumns.length)

  const title = useMemo(() => {
    if (isExportOptionsView(view)) {
      if (view === 'export') return { label: 'Export', back: 'main' as ListOptionsView }
      const map: Record<string, string> = {
        'export-csv': 'Export / CSV',
        'export-json': 'Export / JSON',
        'export-print': 'Print view',
      }
      return { label: map[view], back: 'export' as ListOptionsView }
    }
    if (view === 'columns') return { label: 'Show/hide columns', back: 'main' as ListOptionsView }
    if (view === 'density') return { label: 'Density', back: 'main' as ListOptionsView }
    return { label: 'List options', back: null }
  }, [view])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-sm">
        <SheetHeader className="flex-row items-center gap-1 space-y-0">
          {title.back && (
            <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={() => onViewChange(title.back!)}>
              <ChevronLeft className="size-4" />
            </Button>
          )}
          <SheetTitle>{title.label}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {view === 'main' && (
            <div className="flex flex-col">
              <OptionRow
                title="Show/hide columns"
                description={hiddenCount === 0 ? 'All columns shown' : `${hiddenCount} hidden`}
                onClick={() => onViewChange('columns')}
              />
              <OptionRow
                title="Export"
                description="Download or print the data"
                onClick={() => onViewChange('export')}
              />
              <OptionRow title="Density" description={density} onClick={() => onViewChange('density')} />

              <div className="flex items-center justify-between px-1 py-3">
                <div>
                  <div className="text-sm font-medium">Show relations</div>
                  <div className="text-xs text-muted-foreground">
                    {relationsSupported
                      ? 'Resolve foreign keys to readable names'
                      : 'This table has no foreign keys'}
                  </div>
                </div>
                <Switch
                  checked={showRelations}
                  disabled={!relationsSupported}
                  onCheckedChange={onShowRelationsChange}
                />
              </div>

              <div className="mt-2 border-t pt-3">
                <Button variant="outline" size="sm" className="w-full" onClick={onResetColumnWidths}>
                  Reset column widths
                </Button>
              </div>
            </div>
          )}

          {isExportOptionsView(view) && (
            <ExportViews
              view={view}
              onNavigate={onViewChange}
              visibleCount={visibleCount}
              filteredCount={filteredCount}
              selectedCount={selectedCount}
              jsonPretty={jsonPretty}
              onJsonPrettyChange={onJsonPrettyChange}
              onExport={onExport}
            />
          )}

          {view === 'columns' && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Show or hide columns in this view</p>
                <Button variant="ghost" size="sm" onClick={onShowAllColumns}>
                  Show all
                </Button>
              </div>
              <div className="flex flex-col">
                {columns.map((column) => (
                  <div key={column.key} className="flex items-center justify-between py-2">
                    <span className="text-sm">{column.label}</span>
                    <Switch
                      checked={visibleColumns.includes(column.key)}
                      disabled={column.key === idField}
                      onCheckedChange={(next: boolean) => onToggleColumn(column.key, next)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'density' && (
            <div>
              <p className="mb-3 text-sm text-muted-foreground">Choose how compact table rows should be</p>
              <div className="inline-flex rounded-md border p-0.5">
                {(['default', 'middle', 'small'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => onDensityChange(d)}
                    className={cn(
                      'rounded px-3 py-1.5 text-xs font-medium transition-colors',
                      density === d ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    )}
                  >
                    {d === 'default' ? 'Default' : d === 'middle' ? 'Middle' : 'Compact'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function OptionRow({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between rounded-md px-1 py-3 text-left hover:bg-muted"
    >
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  )
}

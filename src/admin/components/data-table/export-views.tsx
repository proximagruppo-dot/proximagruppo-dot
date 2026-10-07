import { ChevronRight, Download, Printer } from 'lucide-react'

import { Button } from '@admin/components/ui/button'
import { Switch } from '@admin/components/ui/switch'
import type { ExportFormat, ExportMode } from '@admin/lib/export'

export type ExportOptionsView = 'export' | 'export-csv' | 'export-json' | 'export-print'

export const isExportOptionsView = (view: string): view is ExportOptionsView => view.startsWith('export')

function ModeButtons({
  visibleCount,
  filteredCount,
  selectedCount,
  onPick,
}: {
  visibleCount: number
  filteredCount: number
  selectedCount: number
  onPick: (mode: ExportMode) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button className="justify-between" onClick={() => onPick('visible')}>
        This page
        <span className="text-xs opacity-80">{visibleCount.toLocaleString()} rows</span>
      </Button>
      <Button variant="outline" className="justify-between" onClick={() => onPick('all')}>
        Everything matching filters
        <span className="text-xs opacity-80">{filteredCount.toLocaleString()} rows</span>
      </Button>
      <Button
        variant="outline"
        className="justify-between"
        disabled={selectedCount === 0}
        onClick={() => onPick('selected')}
      >
        Selected rows
        <span className="text-xs opacity-80">{selectedCount.toLocaleString()} rows</span>
      </Button>
    </div>
  )
}

export function ExportViews({
  view,
  onNavigate,
  visibleCount,
  filteredCount,
  selectedCount,
  jsonPretty,
  onJsonPrettyChange,
  onExport,
}: {
  view: ExportOptionsView
  onNavigate: (view: ExportOptionsView) => void
  visibleCount: number
  filteredCount: number
  selectedCount: number
  jsonPretty: boolean
  onJsonPrettyChange: (value: boolean) => void
  onExport: (format: ExportFormat, mode: ExportMode) => void
}) {
  if (view === 'export') {
    return (
      <div className="flex flex-col">
        {(
          [
            ['export-csv', 'CSV', 'Comma-separated, opens in Excel and Sheets'],
            ['export-json', 'JSON', 'Raw records for scripts and backups'],
            ['export-print', 'Print view', 'A clean printable table in a new tab'],
          ] as const
        ).map(([target, title, description]) => (
          <button
            key={target}
            onClick={() => onNavigate(target)}
            className="flex items-center justify-between rounded-md px-1 py-3 text-left hover:bg-muted"
          >
            <div>
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    )
  }

  if (view === 'export-csv') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Only the columns currently shown are exported, in the order they appear.
        </p>
        <ModeButtons
          visibleCount={visibleCount}
          filteredCount={filteredCount}
          selectedCount={selectedCount}
          onPick={(mode) => onExport('csv', mode)}
        />
      </div>
    )
  }

  if (view === 'export-json') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Pretty-print</div>
            <div className="text-xs text-muted-foreground">Indented and readable, but a larger file</div>
          </div>
          <Switch checked={jsonPretty} onCheckedChange={onJsonPrettyChange} />
        </div>
        <ModeButtons
          visibleCount={visibleCount}
          filteredCount={filteredCount}
          selectedCount={selectedCount}
          onPick={(mode) => onExport('json', mode)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Printer className="size-3.5" />
        Opens a print dialog in a new tab.
      </p>
      <ModeButtons
        visibleCount={visibleCount}
        filteredCount={filteredCount}
        selectedCount={selectedCount}
        onPick={(mode) => onExport('print', mode)}
      />
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Download className="mt-0.5 size-3" />
        Excel (.xlsx) is not offered: it needs the deprecated `xlsx` package. CSV opens directly in Excel.
      </p>
    </div>
  )
}

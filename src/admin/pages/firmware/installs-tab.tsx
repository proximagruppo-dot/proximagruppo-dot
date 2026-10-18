import { X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { DataTableSkeleton } from '@admin/components/data-table/data-table-skeleton'
import { Button } from '@admin/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@admin/components/ui/table'
import { compareVersions, lampErrorText } from '@admin/lib/firmware'
import { formatRelative, formatWhen } from '@admin/pages/firmware/helpers'
import { InstallResultBadge, Notice } from '@admin/pages/firmware/shared'
import { cn } from '@admin/lib/utils'

const PAGE_SIZE = 50
const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))
const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

interface VersionStats {
  version: string
  attempts: number
  ok: number
  byResult: Record<string, number>
  lamps: number
}

export function InstallsTab({
  rows,
  error,
  loading,
}: {
  rows: Record<string, unknown>[] | null
  error: string | null
  loading: boolean
}) {
  const [versionFilter, setVersionFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // 008_firmware.sql: the table is append-only, so a rollback is a SECOND row
  // (result rolled_back, same lamp and to_version) after the 'ok' one. An attempt
  // is therefore every row that is not a rollback, and an install was kept when
  // its lamp has more 'ok' rows than 'rolled_back' rows for that version.
  const stats = useMemo<VersionStats[]>(() => {
    const map = new Map<string, { byResult: Record<string, number>; perLamp: Map<string, { ok: number; rb: number }> }>()
    for (const r of rows ?? []) {
      const v = str(r.to_version) ?? 'unknown'
      const s = map.get(v) ?? { byResult: {} as Record<string, number>, perLamp: new Map<string, { ok: number; rb: number }>() }
      const result = str(r.result) ?? 'unknown'
      s.byResult[result] = (s.byResult[result] ?? 0) + 1
      const mac = str(r.mac_address) ?? ''
      const lamp = s.perLamp.get(mac) ?? { ok: 0, rb: 0 }
      if (result === 'ok') lamp.ok++
      if (result === 'rolled_back') lamp.rb++
      s.perLamp.set(mac, lamp)
      map.set(v, s)
    }
    return [...map.entries()]
      .map(([version, s]) => {
        let kept = 0
        for (const l of s.perLamp.values()) kept += Math.max(0, l.ok - l.rb)
        const attempts = Object.entries(s.byResult)
          .filter(([k]) => k !== 'rolled_back')
          .reduce((n, [, c]) => n + c, 0)
        return { version, attempts, ok: kept, byResult: s.byResult, lamps: s.perLamp.size }
      })
      .sort((a, b) => compareVersions(b.version, a.version))
  }, [rows])

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => !versionFilter || (str(r.to_version) ?? 'unknown') === versionFilter),
    [rows, versionFilter]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  if (loading && !rows) return <DataTableSkeleton columns={8} rows={6} />

  if (error) {
    return (
      <div className="p-6">
        <Notice tone="error" title="Could not read public.firmware_install">
          <p className="font-mono text-xs">{error}</p>
          <p className="mt-1">
            The table comes from the firmware migration (008_firmware.sql). If it has not been run yet the table does not
            exist; if it has, your account may not be an admin.
          </p>
        </Notice>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-4 p-6 pb-4">
        {stats.length === 0 ? (
          <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
            No install has been reported yet. The app writes one row per install attempt.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => {
              const rate = s.attempts ? Math.round((s.ok / s.attempts) * 100) : 0
              const active = versionFilter === s.version
              return (
                <button
                  key={s.version}
                  type="button"
                  onClick={() => {
                    setVersionFilter(active ? null : s.version)
                    setPage(1)
                  }}
                  className={cn(
                    'rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40',
                    active && 'ring-2 ring-ring'
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-medium">{s.version}</span>
                    <span
                      className={cn(
                        'text-2xl font-semibold tabular-nums',
                        rate >= 90
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : rate >= 60
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-destructive'
                      )}
                    >
                      {rate}%
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.ok} of {s.attempts} installs kept · {s.lamps} {s.lamps === 1 ? 'lamp' : 'lamps'}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-emerald-500" style={{ width: `${rate}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(s.byResult)
                      .filter(([k]) => k !== 'ok')
                      .map(([k, n]) => (
                        <span key={k} className="text-xs text-muted-foreground">
                          {n} {k.replace(/_/g, ' ')}
                        </span>
                      ))
                      .reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, ' · ', el] : [el]), [])}
                  </div>
                </button>
              )
            })}
          </div>
        )}
        {stats.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Kept = installs reported ok and not followed by a rolled-back report for the same lamp and version (the lamp
            rolls back on its own; the app reports it on the next connect as a second row). Rollback rows are not counted
            as attempts.
          </p>
        )}
        {versionFilter && (
          <div>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setVersionFilter(null)}>
              <X className="size-3.5" /> Showing installs of {versionFilter} only
            </Button>
          </div>
        )}
      </div>

      {shown.length > 0 && (
        <div className="mx-6 rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Lamp</TableHead>
                <TableHead>Update</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Lamp error</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>App</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r, i) => {
                const code = num(r.lamp_error)
                const errText = str(r.error_text)
                return (
                  <TableRow key={str(r.id) ?? i}>
                    <TableCell className="align-top" title={formatWhen(str(r.created_at))}>
                      {formatRelative(str(r.created_at))}
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="font-mono text-xs">{str(r.mac_address) ?? '—'}</span>
                      {str(r.lamp_id) && <span className="ml-1.5 text-xs text-muted-foreground">#{str(r.lamp_id)}</span>}
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs">
                      {str(r.from_version) ?? 'unknown'} → {str(r.to_version) ?? '—'}
                    </TableCell>
                    <TableCell className="align-top text-xs">{str(r.channel) ?? '—'}</TableCell>
                    <TableCell className="align-top">
                      <InstallResultBadge result={str(r.result)} />
                    </TableCell>
                    <TableCell className="max-w-md align-top whitespace-normal text-xs">
                      {code === null || code === 0 ? (
                        <span className="text-muted-foreground">{code === 0 ? 'none' : '—'}</span>
                      ) : (
                        <span>
                          <span className="font-mono font-medium">{code}</span> {lampErrorText(code)}
                        </span>
                      )}
                      {errText && <p className="mt-0.5 font-mono text-muted-foreground">{errText}</p>}
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {num(r.duration_s) === null ? '—' : `${num(r.duration_s)!.toFixed(1)} s`}
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs">{str(r.app_version) ?? '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 px-6 py-3 text-sm text-muted-foreground">
          <span>
            Page {current} of {pageCount} · {filtered.length.toLocaleString()} installs
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
      <div className="h-6" />
    </div>
  )
}

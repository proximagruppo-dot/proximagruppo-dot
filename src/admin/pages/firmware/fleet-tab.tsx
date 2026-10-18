import { useMemo, useState } from 'react'

import { DataTableSkeleton } from '@admin/components/data-table/data-table-skeleton'
import { ToneBadge, type BadgeTone } from '@admin/components/data-table/status-badge'
import { Input } from '@admin/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@admin/components/ui/table'
import { CHANNELS, fleetStatus, type Channel, type FleetStatus } from '@admin/lib/firmware'
import type { FirmwareState } from '@admin/lib/firmware-storage'
import { formatRelative, formatWhen } from '@admin/pages/firmware/helpers'
import { InstallResultBadge, Notice } from '@admin/pages/firmware/shared'
import { cn } from '@admin/lib/utils'

const STATUS_UI: Record<FleetStatus, { label: string; tone: BadgeTone }> = {
  up_to_date: { label: 'up to date', tone: 'success' },
  behind: { label: 'behind', tone: 'warning' },
  ahead: { label: 'ahead', tone: 'error' },
  unknown: { label: 'unknown', tone: 'default' },
}

const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))

export function FleetTab({
  rows,
  error,
  loading,
  state,
}: {
  rows: Record<string, unknown>[] | null
  error: string | null
  loading: boolean
  state: FirmwareState | null
}) {
  const channelVersion = (c: Channel) => {
    const p = state?.pointers[c]
    return p?.status === 'ok' ? p.manifest.version : null
  }
  const [compare, setCompare] = useState<Channel | null>(null)
  // Default to the channel that actually has something on it (stable may be empty).
  const against: Channel = compare ?? (channelVersion('stable') ? 'stable' : 'beta')
  const target = channelVersion(against)
  const [query, setQuery] = useState('')

  const view = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? [])
      .map((r) => {
        const fw = str(r.last_firmware)
        return {
          mac: str(r.mac_address) ?? '—',
          name: str(r.lamp_name) ?? str(r.name),
          lampId: str(r.lamp_id),
          fw,
          seen: str(r.last_seen_at),
          fwAt: str(r.last_firmware_at),
          registered: r.in_registry === undefined ? null : r.in_registry === true,
          result: str(r.last_install_result),
          resultDetail: [
            str(r.last_install_from_version) || str(r.last_install_to_version)
              ? `${str(r.last_install_from_version) ?? '?'} → ${str(r.last_install_to_version) ?? '?'}`
              : null,
            str(r.last_install_at) ? formatRelative(str(r.last_install_at)) : null,
          ]
            .filter(Boolean)
            .join(' · '),
          status: fleetStatus(fw, target),
        }
      })
      .filter((r) => !q || r.mac.toLowerCase().includes(q) || (r.name ?? '').toLowerCase().includes(q))
  }, [rows, query, target])

  const counts = useMemo(() => {
    const c: Record<FleetStatus, number> = { up_to_date: 0, behind: 0, ahead: 0, unknown: 0 }
    for (const r of view) c[r.status]++
    return c
  }, [view])

  if (loading && !rows) return <DataTableSkeleton columns={6} rows={6} />

  return (
    <div className="flex flex-col gap-4 p-6">
      {error ? (
        <Notice tone="error" title="Could not read public.firmware_fleet">
          <p className="font-mono text-xs">{error}</p>
          <p className="mt-1">
            The fleet view comes from the firmware migration (008_firmware.sql). If it has not been run on this project
            yet, the view does not exist; if it has, your account may not be an admin.
          </p>
        </Notice>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border p-0.5">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCompare(c)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    against === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  vs {c} {channelVersion(c) ? `(${channelVersion(c)})` : '(empty)'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(Object.keys(STATUS_UI) as FleetStatus[]).map((s) =>
                counts[s] > 0 ? (
                  <ToneBadge key={s} tone={STATUS_UI[s].tone}>
                    {counts[s]} {STATUS_UI[s].label}
                  </ToneBadge>
                ) : null
              )}
            </div>
            <Input
              className="ml-auto h-8 w-60"
              placeholder="Filter by MAC or lamp name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {!target && (
            <Notice tone="warning">
              The {against} channel is empty, so no lamp can be up to date or behind on it: every status is “unknown”.
            </Notice>
          )}

          {view.length === 0 ? (
            <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
              {rows && rows.length > 0 ? 'No lamp matches this filter.' : 'No lamp has reported a firmware version yet.'}
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>MAC</TableHead>
                    <TableHead>Lamp</TableHead>
                    <TableHead>Last firmware</TableHead>
                    <TableHead>vs {against}</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Last install</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.map((r) => (
                    <TableRow key={r.mac}>
                      <TableCell className="font-mono text-xs">{r.mac}</TableCell>
                      <TableCell>
                        {r.name ?? <span className="text-muted-foreground">unregistered</span>}
                        {r.lampId && <span className="ml-1.5 text-xs text-muted-foreground">#{r.lampId}</span>}
                        {r.registered === false && (
                          <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400" title="MAC not in Lamp Registry">
                            not in registry
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm" title={r.fwAt ? `reported ${formatWhen(r.fwAt)}` : undefined}>
                        {r.fw ?? '—'}
                      </TableCell>
                      <TableCell>
                        <ToneBadge
                          tone={STATUS_UI[r.status].tone}
                          title={
                            r.status === 'behind'
                              ? `The app will offer ${target} on its next connect.`
                              : r.status === 'ahead'
                                ? `${against} points at an older version (${target}); the app will offer it as a rollback.`
                                : r.status === 'unknown'
                                  ? 'No version reported, or the channel is empty.'
                                  : undefined
                          }
                        >
                          {STATUS_UI[r.status].label}
                        </ToneBadge>
                      </TableCell>
                      <TableCell title={formatWhen(r.seen)}>{formatRelative(r.seen)}</TableCell>
                      <TableCell>
                        <InstallResultBadge result={r.result} />
                        {r.resultDetail && (
                          <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.resultDetail}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Versions are “as of the last app connect”: a lamp updated by other means shows its old version until a phone
            connects to it again.
          </p>
        </>
      )}
    </div>
  )
}

import { AlertTriangle, Upload } from 'lucide-react'

import { Button } from '@admin/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@admin/components/ui/table'
import { DataTableSkeleton } from '@admin/components/data-table/data-table-skeleton'
import { CHANNELS, type Channel } from '@admin/lib/firmware'
import type { FirmwareState } from '@admin/lib/firmware-storage'
import { formatBytes, formatDay, formatWhen } from '@admin/pages/firmware/helpers'
import { ChannelBadge, CopyHash, Notice, StorageErrorBox } from '@admin/pages/firmware/shared'
import type { MoveTarget } from '@admin/pages/firmware/channel-move-dialog'

export function ReleasesTab({
  state,
  loading,
  onMove,
  onPublish,
}: {
  state: FirmwareState | null
  loading: boolean
  onMove: (t: MoveTarget) => void
  onPublish: () => void
}) {
  if (loading && !state) return <DataTableSkeleton columns={8} rows={4} />
  if (!state) return null

  const channelsOf = (version: string): Channel[] =>
    CHANNELS.filter((c) => {
      const p = state.pointers[c]
      return p.status === 'ok' && p.manifest.version === version
    })

  const pointed = CHANNELS.flatMap((c) => {
    const p = state.pointers[c]
    return p.status === 'ok' ? [`${c} → ${p.manifest.version}`] : []
  })

  return (
    <div className="flex flex-col gap-4 p-6">
      {state.listError && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Could not list the firmware bucket</p>
          <StorageErrorBox error={state.listError} />
          <p className="text-xs text-muted-foreground">
            Listing needs the admins’ SELECT policy on storage.objects. The channel pointers below are read through the
            public URL and do not need it.
          </p>
        </div>
      )}

      {!state.listError && state.releases.length === 0 && pointed.length > 0 && (
        <Notice tone="warning" title="The bucket listing came back empty">
          …but {pointed.join(' and ')} {pointed.length === 1 ? 'is' : 'are'} served publicly. Storage returns an empty list
          to accounts that are not admins (public.is_admin() is false).
        </Notice>
      )}

      {!state.listError && state.releases.length === 0 ? (
        <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
          <p>No versions in the firmware bucket yet.</p>
          <Button size="sm" className="mt-3 gap-1.5" onClick={onPublish}>
            <Upload className="size-3.5" /> Publish the first release
          </Button>
        </div>
      ) : (
        state.releases.length > 0 && (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Released</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>SHA-256</TableHead>
                  <TableHead>hw_rev</TableHead>
                  <TableHead>min_app</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right" title="Copy this version's manifest over a channel pointer">Point channel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.releases.map((r) => {
                  const m = r.manifest
                  const on = channelsOf(r.version)
                  return (
                    <TableRow key={r.version}>
                      <TableCell className="align-top font-mono text-sm font-medium">
                        {r.version}
                        {m?.git && <div className="text-xs font-normal text-muted-foreground">git {m.git}</div>}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex gap-1">
                          {on.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            on.map((c) => <ChannelBadge key={c} channel={c} />)
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm" title={formatWhen(m?.released)}>
                        {formatDay(m?.released)}
                      </TableCell>
                      <TableCell className="align-top tabular-nums" title={m ? `${m.size.toLocaleString()} bytes` : ''}>
                        {formatBytes(m?.size)}
                      </TableCell>
                      <TableCell className="align-top">
                        <CopyHash value={m?.sha256} />
                      </TableCell>
                      <TableCell className="align-top font-mono text-xs">{m?.hw_rev?.join(', ') ?? '—'}</TableCell>
                      <TableCell className="align-top font-mono text-xs">{m?.min_app ?? '—'}</TableCell>
                      <TableCell className="min-w-64 max-w-md align-top whitespace-normal text-sm">
                        {r.problem && (
                          <p className="mb-1 flex items-center gap-1.5 text-destructive">
                            <AlertTriangle className="size-3.5 shrink-0" /> {r.problem}
                          </p>
                        )}
                        {m?.notes ?? (r.problem ? null : <span className="text-muted-foreground">—</span>)}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex justify-end gap-1">
                          {CHANNELS.map((c) => (
                            <Button
                              key={c}
                              variant="outline"
                              size="xs"
                              disabled={!m || !!r.problem || on.includes(c)}
                              title={on.includes(c) ? `${c} already points at ${r.version}` : undefined}
                              onClick={() => onMove({ channel: c, version: r.version })}
                            >
                              {c}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )
      )}

      <Notice>
        Version folders are immutable: nobody can change or delete a released file, because a phone may be mid-download.
        A fix is always a new version. Moving a channel copies that version’s manifest over the channel pointer.
      </Notice>
    </div>
  )
}

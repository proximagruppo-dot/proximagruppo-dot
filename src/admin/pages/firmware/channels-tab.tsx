import { ArrowDownToLine, ArrowUpToLine, PauseCircle } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@admin/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@admin/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@admin/components/ui/select'
import { DataTableSkeleton } from '@admin/components/data-table/data-table-skeleton'
import { CHANNELS, compareVersions, pointerPath, type Channel } from '@admin/lib/firmware'
import type { FirmwareState, PointerState, ReleaseRow } from '@admin/lib/firmware-storage'
import { formatBytes, formatWhen } from '@admin/pages/firmware/helpers'
import { ChannelBadge, CopyHash, Notice } from '@admin/pages/firmware/shared'
import type { MoveTarget } from '@admin/pages/firmware/channel-move-dialog'

function ChannelCard({
  channel,
  pointer,
  releases,
  onMove,
}: {
  channel: Channel
  pointer: PointerState
  releases: ReleaseRow[]
  onMove: (t: MoveTarget) => void
}) {
  const current = pointer.status === 'ok' ? pointer.manifest : null
  const candidates = releases.filter((r) => r.manifest && !r.problem && r.version !== current?.version)
  const [picked, setPicked] = useState<string>('')
  const choice = candidates.some((c) => c.version === picked) ? picked : (candidates[0]?.version ?? '')
  const isRollback = current !== null && choice !== '' && compareVersions(choice, current.version) < 0

  // The pointer is a copy of a version manifest; if its bytes no longer match
  // that version's record, someone wrote it by hand.
  const record = current ? releases.find((r) => r.version === current.version) : undefined
  const drifted = current && record?.manifest && record.manifest.sha256 !== current.sha256

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ChannelBadge channel={channel} />
            <span className="font-mono text-2xl font-semibold tracking-tight">{current ? current.version : 'empty'}</span>
          </CardTitle>
        </div>
        <CardDescription className="font-mono text-xs">{pointerPath(channel)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pointer.status === 'empty' && (
          <p className="text-sm text-muted-foreground">
            No pointer file (404). Phones on {channel} are offered nothing until a version is promoted here.
          </p>
        )}
        {pointer.status === 'invalid' && (
          <Notice tone="error" title="The pointer is not a valid manifest">
            {pointer.error}
          </Notice>
        )}
        {pointer.status === 'error' && (
          <Notice tone="error" title="Could not read the pointer">
            {pointer.error}
          </Notice>
        )}
        {current && (
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Released</dt>
            <dd>{formatWhen(current.released)}</dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd className="tabular-nums">{formatBytes(current.size)}</dd>
            <dt className="text-muted-foreground">SHA-256</dt>
            <dd>
              <CopyHash value={current.sha256} />
            </dd>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="text-muted-foreground">{current.notes ?? '—'}</dd>
          </dl>
        )}
        {drifted && (
          <Notice tone="warning" title="Pointer differs from the release record">
            {pointerPath(channel)} names {current.version} but its sha256 is not the one in {current.version}/manifest.json.
            Promote {current.version} again to repair it.
          </Notice>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other complete version in the bucket to move {channel} to.</p>
          ) : (
            <>
              <Select value={choice} onValueChange={(v: string | null) => v && setPicked(v)}>
                <SelectTrigger className="h-8 w-[130px] font-mono text-sm">
                  <SelectValue>{choice}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((r) => (
                    <SelectItem key={r.version} value={r.version} className="font-mono">
                      {r.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={isRollback ? 'outline' : 'default'}
                className="gap-1.5"
                disabled={!choice}
                onClick={() => onMove({ channel, version: choice })}
              >
                {isRollback ? <ArrowDownToLine className="size-3.5" /> : <ArrowUpToLine className="size-3.5" />}
                {isRollback ? `Roll back ${channel} to ${choice}` : `Promote ${choice} to ${channel}`}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ChannelsTab({
  state,
  loading,
  onMove,
}: {
  state: FirmwareState | null
  loading: boolean
  onMove: (t: MoveTarget) => void
}) {
  if (loading && !state) return <DataTableSkeleton columns={2} rows={4} />
  if (!state) return null

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {CHANNELS.map((c) => (
          <ChannelCard key={c} channel={c} pointer={state.pointers[c]} releases={state.releases} onMove={onMove} />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <PauseCircle className="size-4" /> Why there is no “Pause channel” button
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Emptying a channel means deleting its pointer file, and the bucket allows no DELETE for anyone: a phone may be
            in the middle of downloading. So a channel, once switched on, always names some version.
          </p>
          <p>
            <strong className="text-foreground">To pause a channel</strong>, point it at the version the lamps already
            run (usually the previous release). The app only offers a version that is <em>different</em> from what the
            lamp runs, so lamps on that version are offered nothing. Lamps that already installed the newer one will be
            offered the older one: that is a rollback, and it is the same action.
          </p>
          <p>
            Truly emptying a channel (a 404 again) needs someone with the service role in the Supabase dashboard; agree
            it with Ali first.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

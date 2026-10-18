import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

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
import { compareVersions, pointerPath, type Channel } from '@admin/lib/firmware'
import {
  moveChannel,
  precheckChannelMove,
  type MovePrecheck,
  type PointerState,
  type StorageErrorLike,
} from '@admin/lib/firmware-storage'
import { CheckIcon, Notice, StorageErrorBox } from '@admin/pages/firmware/shared'
import { formatBytes } from '@admin/pages/firmware/helpers'

export interface MoveTarget {
  channel: Channel
  version: string
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'check-failed'; error: string }
  | { kind: 'ready'; pre: MovePrecheck }
  | { kind: 'moving'; pre: MovePrecheck }
  | { kind: 'done'; verified: boolean; readBack?: string }
  | { kind: 'failed'; pre: MovePrecheck; error: StorageErrorLike }

/** "Promote X to beta" / "Roll back stable to Y": one confirm dialog for both,
 *  since both are the same write -- a version's manifest bytes copied over the
 *  channel pointer, cacheControl 0, upsert true. */
export function ChannelMoveDialog({
  target,
  pointer,
  onClose,
  onDone,
}: {
  target: MoveTarget | null
  pointer: PointerState | undefined
  onClose: () => void
  onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  // What the channel pointed at when the dialog opened; the page reloads after a
  // move, and the dialog must keep describing the move it made.
  const [current] = useState(() => (pointer?.status === 'ok' ? pointer.manifest.version : null))

  useEffect(() => {
    if (!target) return
    // The dialog is keyed by its target, so each move starts in 'checking'.
    let cancelled = false
    precheckChannelMove(target.version)
      .then((pre) => !cancelled && setPhase({ kind: 'ready', pre }))
      .catch((e) => !cancelled && setPhase({ kind: 'check-failed', error: e instanceof Error ? e.message : String(e) }))
    return () => {
      cancelled = true
    }
  }, [target])

  if (!target) return null
  const { channel, version } = target
  const isRollback = current !== null && compareVersions(version, current) < 0
  const verb = isRollback ? 'Roll back' : 'Promote'
  const title = isRollback ? `Roll back ${channel} to ${version}?` : `Promote ${version} to ${channel}?`

  const run = async () => {
    if (phase.kind !== 'ready' && phase.kind !== 'failed') return
    const pre = phase.pre
    setPhase({ kind: 'moving', pre })
    const res = await moveChannel(channel, pre)
    if (!res.ok) setPhase({ kind: 'failed', pre, error: res.error })
    else {
      setPhase({ kind: 'done', verified: res.verified === true, readBack: res.readBack })
      onDone()
    }
  }

  const pre = phase.kind === 'ready' || phase.kind === 'moving' || phase.kind === 'failed' ? phase.pre : null
  const blocked = pre !== null && pre.problems.length > 0

  return (
    <AlertDialog open onOpenChange={(open: boolean) => !open && phase.kind !== 'moving' && onClose()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            <div className="flex flex-col gap-2 text-left">
              <p>
                <strong className="text-foreground">
                  Every phone on {channel} will be offered {version} on its next connect
                </strong>{' '}
                to any lamp that is not already running {version}. Nothing installs until the user taps Install.
              </p>
              {current === null ? (
                <p>The {channel} channel is empty today, so this also switches the channel on.</p>
              ) : current === version ? (
                <p>{channel} already points at {version}; this rewrites the same bytes.</p>
              ) : (
                <p>
                  Today {channel} points at {current}.
                  {isRollback &&
                    ` Lamps already on ${current} will be offered ${version} as well: the app offers any version different from what the lamp runs, which is how a rollback reaches them.`}
                </p>
              )}
              {channel === 'stable' && (
                <p>Stable is the channel every customer's phone reads, not only the test lamps.</p>
              )}
              <p className="font-mono text-xs">
                copy {version}/manifest.json → {pointerPath(channel)} (cacheControl 0, upsert)
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {phase.kind === 'checking' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking {version} in the bucket…
          </p>
        )}
        {phase.kind === 'check-failed' && (
          <Notice tone="error" title="Cannot point a channel at this version">
            {phase.error}
          </Notice>
        )}
        {pre && (
          <ul className="flex flex-col gap-1.5 text-sm">
            <li className="flex items-center gap-2">
              <CheckIcon status="pass" /> Release record {version}/manifest.json found and valid
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon status={pre.imageSize !== null && pre.problems.length === 0 ? 'pass' : 'fail'} />
              Image in the bucket{pre.imageSize !== null ? ` (${formatBytes(pre.imageSize)})` : ''}
            </li>
            {pre.problems.map((p) => (
              <li key={p} className="flex items-center gap-2 text-destructive">
                <CheckIcon status="fail" /> {p}
              </li>
            ))}
          </ul>
        )}
        {phase.kind === 'failed' && <StorageErrorBox error={phase.error} />}
        {phase.kind === 'done' &&
          (phase.verified ? (
            <Notice title={`${channel} now points at ${version}`}>
              Read back through the public URL: phones see {version}.
            </Notice>
          ) : (
            <Notice tone="warning" title="Written, but the read-back does not match yet">
              The public pointer answered “{phase.readBack ?? 'nothing'}”. Refresh in a minute; if it persists, check the
              bucket in the Supabase dashboard.
            </Notice>
          ))}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={phase.kind === 'moving'}>{phase.kind === 'done' ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {phase.kind !== 'done' && (
            <AlertDialogAction
              variant={channel === 'stable' || isRollback ? 'destructive' : 'default'}
              disabled={!(phase.kind === 'ready' || phase.kind === 'failed') || blocked}
              onClick={run}
            >
              {phase.kind === 'moving' && <Loader2 className="animate-spin" />}
              {phase.kind === 'failed' ? 'Retry' : `${verb} ${channel}`}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

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
import { APP_DEVICE, latestPath, releasePath } from '@admin/lib/app-releases'
import {
  makeCurrent,
  precheckMakeCurrent,
  type LatestState,
  type MakeCurrentPrecheck,
} from '@admin/lib/app-release-storage'
import type { StorageErrorLike } from '@admin/lib/firmware-storage'
import { formatBytes } from '@admin/pages/firmware/helpers'
import { CheckIcon, Notice } from '@admin/pages/firmware/shared'
import type { MakeCurrentTarget } from '@admin/pages/app-releases/app-card'
import { AppStorageErrorBox } from '@admin/pages/app-releases/shared'

type Phase =
  | { kind: 'checking' }
  | { kind: 'check-failed'; error: string }
  | { kind: 'ready'; pre: MakeCurrentPrecheck }
  | { kind: 'moving'; pre: MakeCurrentPrecheck }
  | { kind: 'done'; verified: boolean; readBack?: string; announced: boolean | null }
  | { kind: 'failed'; pre: MakeCurrentPrecheck; error: StorageErrorLike }

/** "Make current" and "Roll back to …" are the same write: a version's
 *  release.json bytes copied over <app>/latest.json (cacheControl 0, upsert true),
 *  then the app-releases broadcast. Only what it means for testers differs. */
export function MakeCurrentDialog({
  target,
  latest,
  onClose,
  onDone,
}: {
  target: MakeCurrentTarget
  latest: LatestState | undefined
  onClose: () => void
  onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  // What latest.json named when the dialog opened; the page reloads after the
  // move, and the dialog must keep describing the move it made.
  const [current] = useState(() =>
    latest?.status === 'ok' ? { code: latest.release.versionCode, name: latest.release.versionName } : null
  )

  useEffect(() => {
    // The dialog is keyed by its target, so each move starts in 'checking'.
    let cancelled = false
    precheckMakeCurrent(target.app, target.versionCode)
      .then((pre) => !cancelled && setPhase({ kind: 'ready', pre }))
      .catch((e) => !cancelled && setPhase({ kind: 'check-failed', error: e instanceof Error ? e.message : String(e) }))
    return () => {
      cancelled = true
    }
  }, [target])

  const { app, versionCode, versionName } = target
  const device = APP_DEVICE[app]
  const label = `${versionName} (${versionCode})`
  const isRollback = current !== null && versionCode < current.code
  const title = isRollback ? `Roll back ${app} to ${label}?` : `Make ${label} the current ${app} version?`

  const run = async () => {
    if (phase.kind !== 'ready' && phase.kind !== 'failed') return
    const pre = phase.pre
    setPhase({ kind: 'moving', pre })
    const res = await makeCurrent(app, pre)
    if (!res.ok) {
      setPhase({ kind: 'failed', pre, error: res.error })
      return
    }
    setPhase({ kind: 'done', verified: res.verified === true, readBack: res.readBack, announced: null })
    onDone()
    const announced = (await res.announced) ?? false
    setPhase((p) => (p.kind === 'done' ? { ...p, announced } : p))
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
              {isRollback && current ? (
                <>
                  <p>
                    <strong className="text-foreground">
                      Every tester’s {device} will be offered {label}, but a {device} only installs a{' '}
                      <em>higher</em> versionCode than the one it runs.
                    </strong>
                  </p>
                  <p>
                    So testers already on {current.name} ({current.code}), or on anything above {versionCode}, are{' '}
                    <strong className="text-foreground">not</strong> offered it and keep what they have. Only {device}s
                    still below {versionCode}, and new installs from the link, get {versionName}. To really move testers
                    back, rebuild the old code with a versionCode above {current.code} and publish that.
                  </p>
                </>
              ) : (
                <p>
                  <strong className="text-foreground">Every tester’s {device} will be offered {label}.</strong> Open apps
                  hear it at once; the rest on their next check. Nothing installs until the tester confirms Android’s
                  install screen.
                </p>
              )}
              {current === null ? (
                <p>There is no latest.json today, so this also switches updates on for the {app} app.</p>
              ) : current.code === versionCode ? (
                <p>latest.json already names {label}; this rewrites it with the release record’s bytes.</p>
              ) : (
                !isRollback && <p>Today latest.json names {current.name} ({current.code}).</p>
              )}
              <p className="font-mono text-xs">
                copy {releasePath(app, versionCode)} → {latestPath(app)} (cacheControl 0, upsert), then broadcast on
                app-releases
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {phase.kind === 'checking' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking {versionCode} in the bucket…
          </p>
        )}
        {phase.kind === 'check-failed' && (
          <Notice tone="error" title="Cannot make this version current">
            {phase.error}
          </Notice>
        )}
        {pre && (
          <ul className="flex flex-col gap-1.5 text-sm">
            <li className="flex items-center gap-2">
              <CheckIcon status="pass" /> {releasePath(app, versionCode)} found and valid
            </li>
            {pre.apks.map((a) => (
              <li key={a.abi} className="flex items-center gap-2">
                <CheckIcon status={a.size !== null && a.size === a.expected ? 'pass' : 'fail'} />
                <span className="font-mono text-xs">{a.abi}</span> in the bucket
                {a.size !== null ? ` (${formatBytes(a.size)})` : ''}
              </li>
            ))}
            {pre.problems.map((p) => (
              <li key={p} className="flex items-center gap-2 text-destructive">
                <CheckIcon status="fail" /> {p}
              </li>
            ))}
          </ul>
        )}
        {phase.kind === 'failed' && <AppStorageErrorBox error={phase.error} />}
        {phase.kind === 'done' && (
          <>
            {phase.verified ? (
              <Notice title={`${app}/latest.json now names ${label}`}>
                Read back through the public URL: the {app} app sees {versionName}.
              </Notice>
            ) : (
              <Notice tone="warning" title="Written, but the read-back does not match yet">
                The public latest.json answered “{phase.readBack ?? 'nothing'}”. Refresh in a minute; if it persists, check
                the bucket in the Supabase dashboard.
              </Notice>
            )}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckIcon status={phase.announced === null ? 'running' : phase.announced ? 'pass' : 'warn'} />
              {phase.announced === null
                ? 'Broadcasting to open apps…'
                : phase.announced
                  ? 'Broadcast sent on app-releases: open apps check now.'
                  : 'Broadcast not delivered; apps still see it on their next check.'}
            </p>
          </>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={phase.kind === 'moving'}>{phase.kind === 'done' ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {phase.kind !== 'done' && (
            <AlertDialogAction
              variant={isRollback ? 'destructive' : 'default'}
              disabled={!(phase.kind === 'ready' || phase.kind === 'failed') || blocked}
              onClick={run}
            >
              {phase.kind === 'moving' && <Loader2 className="animate-spin" />}
              {phase.kind === 'failed' ? 'Retry' : isRollback ? `Roll back to ${versionName}` : 'Make current'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

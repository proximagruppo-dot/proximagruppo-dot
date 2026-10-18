import { FileUp, Loader2, Upload, X } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'

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
import { Button } from '@admin/components/ui/button'
import { Checkbox } from '@admin/components/ui/checkbox'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@admin/components/ui/sheet'
import {
  APK_CONTENT_TYPE,
  APP_DEVICE,
  JSON_CONTENT_TYPE,
  POINTER_CACHE_CONTROL,
  RELEASE_FILE_CACHE_CONTROL,
  basename,
  latestPath,
  parseRelease,
  releasePath,
  sha256Hex,
  validateAppRelease,
  versionFolder,
  type AppId,
  type ReleaseCheck,
  type ReleaseValidation,
} from '@admin/lib/app-releases'
import {
  announceAppRelease,
  latestKnown,
  readLatest,
  uploadAppObject,
  verifyLatest,
  versionFolderExists,
} from '@admin/lib/app-release-storage'
import type { StorageErrorLike } from '@admin/lib/firmware-storage'
import { SUPABASE_URL } from '@admin/lib/supabase'
import { cn } from '@admin/lib/utils'
import { formatBytes, formatWhen } from '@admin/pages/firmware/helpers'
import { CheckIcon, Notice } from '@admin/pages/firmware/shared'
import { AppStorageErrorBox } from '@admin/pages/app-releases/shared'

type StepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skipped'

interface StepState {
  status: StepStatus
  error?: StorageErrorLike
  /** For steps whose failure is not a Storage error (the pointer re-check). */
  note?: string
}

interface PickedFile {
  name: string
  bytes: ArrayBuffer
}

interface PlanStep {
  /** `apk:<abi>`, `release`, `pointer` or `broadcast`. */
  id: string
  path: string
  bytes?: ArrayBuffer
  type?: string
  cache?: string
  upsert?: boolean
}

type Existence = { state: 'unknown' } | { state: 'known'; exists: boolean } | { state: 'error'; error: string }

/** release.json (preferred by that exact name) and every .apk, from whatever was
 *  dropped or picked. Anything else is reported and ignored. */
function classify(files: File[]) {
  const jsons = files.filter((f) => f.name.toLowerCase().endsWith('.json'))
  const release = jsons.find((f) => f.name === 'release.json') ?? jsons[0]
  const apks = files.filter((f) => f.name.toLowerCase().endsWith('.apk'))
  const ignored = files.filter((f) => f !== release && !apks.includes(f)).map((f) => f.name)
  return { release, apks, ignored }
}

/** Upload order from the contract: every APK, then release.json, then the
 *  pointer, then the broadcast. Pointer and broadcast only when making it current. */
function buildPlan(v: ReleaseValidation, releaseBytes: ArrayBuffer, makeCurrent: boolean): PlanStep[] {
  const r = v.release
  if (!r) return []
  const steps: PlanStep[] = v.matches.map((m) => ({
    id: `apk:${m.abi}`,
    path: m.entry.path,
    bytes: m.file?.bytes as ArrayBuffer | undefined,
    type: APK_CONTENT_TYPE,
    cache: RELEASE_FILE_CACHE_CONTROL,
    upsert: false,
  }))
  steps.push({
    id: 'release',
    path: releasePath(r.app, r.versionCode),
    bytes: releaseBytes,
    type: JSON_CONTENT_TYPE,
    cache: RELEASE_FILE_CACHE_CONTROL,
    upsert: false,
  })
  if (makeCurrent) {
    steps.push({
      id: 'pointer',
      path: latestPath(r.app),
      bytes: releaseBytes,
      type: JSON_CONTENT_TYPE,
      cache: POINTER_CACHE_CONTROL,
      upsert: true,
    })
    steps.push({ id: 'broadcast', path: 'Realtime app-releases · event release' })
  }
  return steps
}

export function AppPublishSheet({
  open,
  onOpenChange,
  app,
  isAdmin,
  onPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opened from one app's card: the release must be for that app. */
  app: AppId | null
  /** From public.is_admin(); false disables Publish (RLS would refuse anyway). */
  isAdmin: boolean | null
  onPublished: () => void
}) {
  const [release, setRelease] = useState<PickedFile | null>(null)
  const [apks, setApks] = useState<PickedFile[]>([])
  const [ignored, setIgnored] = useState<string[]>([])
  const [evaluating, setEvaluating] = useState(false)
  const [existence, setExistence] = useState<Existence>({ state: 'unknown' })
  const [validation, setValidation] = useState<ReleaseValidation | null>(null)
  const [makeCurrentWanted, setMakeCurrent] = useState(true)
  const [steps, setSteps] = useState<Record<string, StepState>>({})
  const [running, setRunning] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [readBack, setReadBack] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const shaCache = useRef(new WeakMap<ArrayBuffer, string>())
  const evalSeq = useRef(0)
  const uploadSection = useRef<HTMLElement>(null)

  // Once anything has been written, the inputs are frozen: what is left to upload
  // must be the very files the first step checked.
  const started = Object.entries(steps).some(([id, s]) => id !== 'broadcast' && s.status === 'pass')
  // Fixed at the first write, so a later "Open from the other card" cannot change it.
  const [startedApp, setStartedApp] = useState<AppId | null>(null)
  const expectedApp = startedApp ?? app ?? undefined

  const reset = () => {
    evalSeq.current++
    setRelease(null)
    setApks([])
    setIgnored([])
    setEvaluating(false)
    setExistence({ state: 'unknown' })
    setValidation(null)
    setMakeCurrent(true)
    setSteps({})
    setReadBack(null)
    setStartedApp(null)
  }

  /** Every pre-upload check: hash each APK (once per file), ask the bucket whether
   *  the version folder is taken, read the current latest.json, then validate.
   *  A newer pick supersedes a check still in flight. */
  const evaluate = async (rel: PickedFile | null, files: PickedFile[]) => {
    const seq = ++evalSeq.current
    setValidation(null)
    setExistence({ state: 'unknown' })
    if (!rel) return
    setEvaluating(true)
    try {
      const hashed = await Promise.all(
        files.map(async (f) => {
          let sha = shaCache.current.get(f.bytes)
          if (!sha) {
            sha = await sha256Hex(f.bytes)
            shaCache.current.set(f.bytes, sha)
          }
          return { name: f.name, bytes: f.bytes, sha256: sha }
        })
      )
      const text = new TextDecoder().decode(rel.bytes)
      const parsed = parseRelease(text)
      let ex: Existence = { state: 'unknown' }
      let latest = latestKnown(undefined)
      if (parsed.ok) {
        const r = parsed.release
        const [exists, lt] = await Promise.all([
          versionFolderExists(r.app, r.versionCode, Object.values(r.apks).map((a) => a.path)).then(
            (e): Existence => ({ state: 'known', exists: e }),
            (e): Existence => ({ state: 'error', error: e instanceof Error ? e.message : String(e) })
          ),
          readLatest(r.app),
        ])
        ex = exists
        latest = latestKnown(lt)
      }
      const v = await validateAppRelease({
        releaseText: text,
        apks: hashed,
        supabaseUrl: SUPABASE_URL,
        expectedApp,
        versionExists: ex.state === 'known' ? ex.exists : undefined,
        latest,
      })
      if (seq !== evalSeq.current) return
      setExistence(ex)
      setValidation(v)
    } finally {
      if (seq === evalSeq.current) setEvaluating(false)
    }
  }

  const checks: ReleaseCheck[] = (validation?.checks ?? []).map((c) => {
    if (c.id === 'fresh' && existence.state === 'error')
      return { ...c, status: 'fail', detail: `could not ask the bucket: ${existence.error}` }
    // The sheet may have been reopened from the other app's card since the checks ran.
    const forApp = validation?.release?.app
    if (c.id === 'app' && expectedApp && forApp && forApp !== expectedApp)
      return { ...c, status: 'fail', detail: `this is a ${forApp} release, but you are publishing to ${expectedApp}` }
    return c
  })
  const allPass = validation !== null && checks.every((c) => c.status === 'pass' || c.status === 'warn')
  const r = validation?.release ?? null
  const label = r ? `${r.versionName} (${r.versionCode})` : null
  const mayBecomeCurrent = validation?.mayBecomeCurrent === true
  const makeCurrent = makeCurrentWanted && mayBecomeCurrent
  const plan = validation && release ? buildPlan(validation, release.bytes, makeCurrent) : []

  const takeFiles = async (files: File[]) => {
    if (started || running) return
    const c = classify(files)
    const nextRelease = c.release ? { name: c.release.name, bytes: await c.release.arrayBuffer() } : release
    const added = await Promise.all(c.apks.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })))
    const nextApks = [...apks.filter((a) => !added.some((n) => n.name === a.name)), ...added]
    setRelease(nextRelease)
    setApks(nextApks)
    setIgnored(c.ignored)
    setSteps({})
    await evaluate(nextRelease, nextApks)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void takeFiles([...e.dataTransfer.files])
  }

  const setStep = (id: string, s: StepState) => setSteps((prev) => ({ ...prev, [id]: s }))
  const statusOf = (id: string): StepStatus => steps[id]?.status ?? 'pending'

  /** The contract's order with its options. Each step runs only if every earlier
   *  one succeeded; a retry resumes at the first step not yet done. */
  const publish = async () => {
    if (!release || !r || !validation) return
    setConfirmOpen(false)
    setRunning(true)
    setReadBack(null)
    uploadSection.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    const firstId = plan[0]?.id
    let current = firstId
    try {
      // Immutability, asked once more at the last moment (another admin may have
      // published the same versionCode since the checks ran).
      if (!started) {
        setStartedApp(r.app)
        const exists = await versionFolderExists(r.app, r.versionCode, plan.filter((s) => s.id.startsWith('apk:')).map((s) => s.path))
        if (exists) {
          setExistence({ state: 'known', exists: true })
          setStep(firstId, {
            status: 'fail',
            error: { message: `${versionFolder(r.app, r.versionCode)} already exists in the bucket`, statusCode: '409' },
          })
          return
        }
      }
      for (const step of plan) {
        current = step.id
        if (statusOf(step.id) === 'pass') continue
        setStep(step.id, { status: 'running' })

        if (step.id === 'broadcast') {
          const ok = await announceAppRelease(r.app, r.versionCode, r.versionName)
          // Best effort: the pointer is already the truth; apps also poll it.
          setStep(step.id, ok ? { status: 'pass' } : { status: 'skipped', note: 'not delivered; apps still see it on their next check' })
          continue
        }

        if (step.id === 'pointer') {
          // Never move the pointer backwards: re-read it right before writing.
          const now = latestKnown(await readLatest(r.app))
          if (now.status === 'unknown' || (now.status === 'ok' && now.versionCode >= r.versionCode)) {
            setStep(step.id, {
              status: 'fail',
              note:
                now.status === 'ok'
                  ? `latest.json now names ${now.versionName} (${now.versionCode}), not lower than ${r.versionCode}: someone published meanwhile. The version folder is uploaded; nothing else was changed.`
                  : `could not read ${latestPath(r.app)} before writing it${now.error ? `: ${now.error}` : ''}`,
            })
            return
          }
        }

        if (!step.bytes || !step.type || !step.cache || step.upsert === undefined) {
          setStep(step.id, { status: 'fail', note: `no file for ${basename(step.path)}` })
          return
        }
        const res = await uploadAppObject(step.path, step.bytes, step.type, step.cache, step.upsert)
        if (!res.ok) {
          setStep(step.id, { status: 'fail', error: res.error })
          return // never write the pointer when an earlier step failed
        }
        setStep(step.id, { status: 'pass' })
      }
      if (makeCurrent) {
        const back = await verifyLatest(r.app, r.versionCode, release.bytes)
        setReadBack(
          back.verified
            ? `${latestPath(r.app)} now names ${label} (read back through the public URL).`
            : `Reading ${latestPath(r.app)} back gave “${back.readBack}”; refresh in a minute.`
        )
      }
      onPublished()
    } catch (e) {
      setStep(current, { status: 'fail', error: { message: e instanceof Error ? e.message : String(e) } })
    } finally {
      setRunning(false)
    }
  }

  const failed = Object.values(steps).some((s) => s.status === 'fail')
  const finished = plan.length > 0 && plan.every((s) => statusOf(s.id) === 'pass' || (s.id === 'broadcast' && statusOf(s.id) === 'skipped'))
  const nothingWritten = !started

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !running && onOpenChange(o)}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0">
            <SheetTitle>{expectedApp ? `Publish a ${expectedApp} build` : 'Publish an app build'}</SheetTitle>
            <SheetDescription>
              Every file is checked in this browser before anything is uploaded. Released files can never be changed or
              deleted afterwards.
            </SheetDescription>
          </div>
          <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" disabled={running} />}>
            <X className="size-4" />
          </SheetClose>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          {/* 1. Files */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">1. Release files</h3>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                if (!started) setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center text-sm transition-colors',
                dragOver ? 'border-primary bg-muted/60' : 'bg-muted/20',
                started && 'opacity-60'
              )}
            >
              <FileUp className="size-5 text-muted-foreground" />
              <p className="text-muted-foreground">
                Drop <span className="font-mono">release.json</span> and the APK file(s) next to it here, together or one
                at a time
              </p>
              <Button variant="outline" size="sm" disabled={started || running} onClick={() => picker.current?.click()}>
                Choose files
              </Button>
              <input
                ref={picker}
                type="file"
                multiple
                accept=".json,.apk,application/json,application/vnd.android.package-archive"
                className="hidden"
                onChange={(e) => {
                  void takeFiles([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
            </div>
            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Record</dt>
              <dd className="truncate font-mono text-xs">{release ? release.name : '—'}</dd>
              <dt className="text-muted-foreground">APKs</dt>
              <dd className="min-w-0 font-mono text-xs">
                {apks.length === 0
                  ? '—'
                  : apks.map((a) => {
                      const m = validation?.matches.find((x) => x.file?.name === a.name)
                      return (
                        <div key={a.name} className="flex gap-2">
                          <span className="truncate">{a.name}</span>
                          <span className="shrink-0 text-muted-foreground">{formatBytes(a.bytes.byteLength)}</span>
                          {validation && (
                            <span className={cn('shrink-0', m ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')}>
                              {m ? `→ ${m.abi}` : 'not named in release.json, not uploaded'}
                            </span>
                          )}
                        </div>
                      )
                    })}
              </dd>
            </dl>
            {ignored.length > 0 && (
              <p className="text-xs text-muted-foreground">Ignored (neither .json nor .apk): {ignored.join(', ')}</p>
            )}
            {release && release.name !== 'release.json' && (
              <p className="text-xs text-muted-foreground">
                It is stored as <span className="font-mono">{r ? releasePath(r.app, r.versionCode) : '<app>/<versionCode>/release.json'}</span>, byte for byte.
              </p>
            )}
          </section>

          {/* 2. Checks */}
          {(validation || release || apks.length > 0) && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">2. Checks before upload</h3>
                {release && !started && (
                  <Button variant="ghost" size="xs" disabled={evaluating || running} onClick={() => void evaluate(release, apks)}>
                    Run checks again
                  </Button>
                )}
              </div>
              {!validation ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  {evaluating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Hashing the APKs and asking the bucket…
                    </>
                  ) : (
                    'Waiting for release.json.'
                  )}
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                      <span className="mt-0.5">
                        <CheckIcon status={c.status === 'pending' ? 'running' : c.status} />
                      </span>
                      <div className="min-w-0">
                        <p>{c.label}</p>
                        <p
                          className={cn(
                            'font-mono text-xs break-all whitespace-pre-wrap',
                            c.status === 'fail'
                              ? 'text-destructive'
                              : c.status === 'warn'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-muted-foreground'
                          )}
                        >
                          {c.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {r && (
                <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/30 p-3 text-sm">
                  <dt className="text-muted-foreground">App</dt>
                  <dd className="font-mono text-xs">
                    {r.app} · {r.package}
                  </dd>
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="font-mono">{label}</dd>
                  <dt className="text-muted-foreground">Released</dt>
                  <dd>{formatWhen(r.released)}</dd>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd>{r.notes || '—'}</dd>
                </dl>
              )}
            </section>
          )}

          {/* 3. Make current */}
          {r && validation && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">3. Testers</h3>
              <label className={cn('flex items-start gap-2.5 text-sm', !mayBecomeCurrent && 'opacity-60')}>
                <Checkbox
                  className="mt-0.5"
                  checked={makeCurrent}
                  disabled={!mayBecomeCurrent || running || statusOf('pointer') === 'pass'}
                  onCheckedChange={(checked: boolean) => setMakeCurrent(checked)}
                />
                <span>
                  Make it the current version
                  <span className="block text-xs text-muted-foreground">
                    {!mayBecomeCurrent
                      ? validation.ok
                        ? `Not available: versionCode ${r.versionCode} is not above the current one, so no ${APP_DEVICE[r.app]} would install it. Rollbacks go through the ${r.app} card.`
                        : 'Available once every check passes.'
                      : makeCurrent
                        ? `${latestPath(r.app)} becomes a copy of this release.json: every tester’s ${APP_DEVICE[r.app]} will be offered ${label}, open apps at once (broadcast), the rest on their next check.`
                        : `The version is uploaded but no tester is offered it. You can make it current later from the ${r.app} card.`}
                  </span>
                </span>
              </label>
            </section>
          )}

          {/* 4. Upload */}
          {plan.length > 0 && (
            <section ref={uploadSection} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">4. Upload, in this order</h3>
              <ol className="divide-y rounded-lg border">
                {plan.map((row, i) => {
                  const s = steps[row.id] ?? { status: 'pending' as const }
                  return (
                    <li key={row.id} className="flex flex-col gap-1.5 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2.5">
                        <CheckIcon status={s.status === 'skipped' ? 'warn' : s.status} />
                        <span className="w-4 text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs break-all">{row.path}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {row.id === 'broadcast'
                              ? `payload { app, versionCode, versionName, at } · best effort`
                              : `${row.type} · cacheControl ${row.cache} · upsert ${String(row.upsert)}${
                                  row.bytes ? ` · ${formatBytes(row.bytes.byteLength)}` : ''
                                }`}
                          </p>
                        </div>
                      </div>
                      {s.error && <AppStorageErrorBox error={s.error} />}
                      {s.note && (
                        <p className={cn('text-xs', s.status === 'fail' ? 'text-destructive' : 'text-muted-foreground')}>
                          {s.note}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
              {failed && nothingWritten && (
                <p className="text-xs text-muted-foreground">Nothing was written. Fix the cause and retry.</p>
              )}
              {failed && !nothingWritten && (
                <p className="text-xs text-muted-foreground">
                  The steps marked done are in the bucket for good. Retry resumes at the failed step; latest.json is never
                  written until every APK and release.json are up.
                </p>
              )}
              {existence.state === 'known' && existence.exists && started && failed && (
                <p className="text-xs text-muted-foreground">
                  If an earlier attempt for this versionCode stopped half-way, that folder stays partial forever: build again
                  with a higher versionCode.
                </p>
              )}
              {finished && (
                <Notice title={`${label} is published`}>
                  {makeCurrent ? readBack : `Not made current: no tester is offered it until you do so from the ${r?.app} card.`}
                </Notice>
              )}
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-4">
          <Button variant="ghost" size="sm" disabled={running || started} onClick={reset}>
            Clear
          </Button>
          {finished ? (
            <Button
              size="sm"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
            >
              Done
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={running || isAdmin === false || !(allPass || started)}
              title={isAdmin === false ? 'Your account is not an admin' : undefined}
              onClick={() => setConfirmOpen(true)}
            >
              {running ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {started || failed ? 'Retry remaining steps' : label ? `Publish ${label}` : 'Publish'}
            </Button>
          )}
        </div>

        {/* Inside the sheet's popup so base-ui treats it as a nested dialog. */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="data-[size=default]:sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Publish {r?.app} {label}?
              </AlertDialogTitle>
              <AlertDialogDescription render={<div />}>
                <div className="flex flex-col gap-2 text-left">
                  <p>
                    <span className="font-mono">{r ? versionFolder(r.app, r.versionCode) : ''}</span> becomes permanent: its
                    files can never be replaced or deleted. A mistake is fixed only by a build with a higher versionCode.
                  </p>
                  <p>
                    {makeCurrent && r ? (
                      <strong className="text-foreground">
                        Every tester’s {APP_DEVICE[r.app]} will be offered {label}.
                      </strong>
                    ) : (
                      'latest.json is not changed, so no tester is offered it yet.'
                    )}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void publish()}>Upload</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}

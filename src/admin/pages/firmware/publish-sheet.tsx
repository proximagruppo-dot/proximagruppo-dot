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
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@admin/components/ui/sheet'
import {
  POINTER_CACHE_CONTROL,
  VERSION_FILE_CACHE_CONTROL,
  imagePath,
  parseManifest,
  pointerPath,
  sha256Hex,
  validateRelease,
  versionManifestPath,
  type Channel,
  type ReleaseCheck,
  type ReleaseValidation,
} from '@admin/lib/firmware'
import { announceRelease,
  readPointer,
  uploadObject,
  versionFolderExists,
  type FirmwareState,
  type StorageErrorLike,
} from '@admin/lib/firmware-storage'
import { SUPABASE_URL } from '@admin/lib/supabase'
import { cn } from '@admin/lib/utils'
import { formatBytes, formatWhen } from '@admin/pages/firmware/helpers'
import { CheckIcon, Notice, StorageErrorBox } from '@admin/pages/firmware/shared'

type StepId = 'bin' | 'manifest' | 'pointer'
type StepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skipped'

interface StepState {
  status: StepStatus
  error?: StorageErrorLike
}

interface PickedFile {
  name: string
  bytes: ArrayBuffer
}

type Existence = { state: 'unknown' } | { state: 'checking' } | { state: 'known'; exists: boolean } | { state: 'error'; error: string }

const INITIAL_STEPS: Record<StepId, StepState> = {
  bin: { status: 'pending' },
  manifest: { status: 'pending' },
  pointer: { status: 'pending' },
}

/** Splits whatever was dropped or picked into the image and the release record.
 *  A package also carries manifest-beta.json (an identical copy); manifest.json
 *  is preferred when both arrive. */
function classify(files: File[]) {
  const bin = files.find((f) => f.name.toLowerCase().endsWith('.bin'))
  const jsons = files.filter((f) => f.name.toLowerCase().endsWith('.json'))
  const manifest = jsons.find((f) => f.name === 'manifest.json') ?? jsons[0]
  return { bin, manifest }
}

export function PublishSheet({
  open,
  onOpenChange,
  state,
  isAdmin,
  onPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: FirmwareState | null
  /** From public.is_admin(); false disables Publish (RLS would refuse anyway). */
  isAdmin: boolean | null
  onPublished: () => void
}) {
  const [bin, setBin] = useState<PickedFile | null>(null)
  const [manifest, setManifest] = useState<PickedFile | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [existence, setExistence] = useState<Existence>({ state: 'unknown' })
  const [validation, setValidation] = useState<ReleaseValidation | null>(null)
  const [channel, setChannel] = useState<Channel | 'none'>('none')
  const [steps, setSteps] = useState<Record<StepId, StepState>>(INITIAL_STEPS)
  const [running, setRunning] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [readBack, setReadBack] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const binInput = useRef<HTMLInputElement>(null)
  const manifestInput = useRef<HTMLInputElement>(null)
  const shaCache = useRef<{ bytes: ArrayBuffer; sha: string } | null>(null)
  const evalSeq = useRef(0)
  const uploadSection = useRef<HTMLElement>(null)

  // Once anything has been written, the inputs are frozen: what is left to
  // upload must be the very files the first step uploaded.
  const started = Object.values(steps).some((s) => s.status === 'pass')

  const reset = () => {
    evalSeq.current++
    setBin(null)
    setManifest(null)
    setEvaluating(false)
    setExistence({ state: 'unknown' })
    setValidation(null)
    setChannel('none')
    setSteps(INITIAL_STEPS)
    setReadBack(null)
  }

  /** Runs every pre-upload check on a (bin, manifest) pair: hash the image
   *  (once per file), ask the bucket whether the version folder is taken, then
   *  validate. A newer pick supersedes a check still in flight. */
  const evaluate = async (b: PickedFile | null, m: PickedFile | null) => {
    const seq = ++evalSeq.current
    setValidation(null)
    setExistence({ state: 'unknown' })
    if (!b || !m) return
    setEvaluating(true)
    try {
      let sha = shaCache.current?.bytes === b.bytes ? shaCache.current.sha : null
      if (!sha) {
        sha = await sha256Hex(b.bytes)
        shaCache.current = { bytes: b.bytes, sha }
      }
      const text = new TextDecoder().decode(m.bytes)
      const parsed = parseManifest(text)
      let ex: Existence = { state: 'unknown' }
      if (parsed.ok) {
        if (seq === evalSeq.current) setExistence({ state: 'checking' })
        try {
          ex = { state: 'known', exists: await versionFolderExists(parsed.manifest.version) }
        } catch (e) {
          ex = { state: 'error', error: e instanceof Error ? e.message : String(e) }
        }
      }
      const v = await validateRelease({
        image: b.bytes,
        imageSha256: sha,
        manifestText: text,
        supabaseUrl: SUPABASE_URL,
        versionExists: () => (ex.state === 'known' ? ex.exists : undefined),
      })
      if (seq !== evalSeq.current) return
      setExistence(ex)
      setValidation(v)
    } finally {
      if (seq === evalSeq.current) setEvaluating(false)
    }
  }

  const checks: ReleaseCheck[] = (validation?.checks ?? []).map((c) => {
    if (c.id !== 'fresh') return c
    if (existence.state === 'error') return { ...c, status: 'fail', detail: `could not ask the bucket: ${existence.error}` }
    if (existence.state === 'known' && existence.exists && c.status !== 'fail' && !started)
      return { ...c, status: 'fail', detail: 'this version folder already exists in the bucket; publish a new version number' }
    return c
  })
  const allPass = validation !== null && checks.every((c) => c.status === 'pass')
  const version = validation?.manifest?.version ?? null

  const takeFiles = async (files: File[]) => {
    if (started || running) return
    const { bin: b, manifest: m } = classify(files)
    const nextBin = b ? { name: b.name, bytes: await b.arrayBuffer() } : bin
    const nextManifest = m ? { name: m.name, bytes: await m.arrayBuffer() } : manifest
    setBin(nextBin)
    setManifest(nextManifest)
    await evaluate(nextBin, nextManifest)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void takeFiles([...e.dataTransfer.files])
  }

  const setStep = (id: StepId, s: StepState) => setSteps((prev) => ({ ...prev, [id]: s }))

  /** Ali's §0, in his order with his options. Each step runs only if every
   *  earlier one succeeded; a retry resumes at the first step not yet done. */
  const publish = async () => {
    if (!bin || !manifest || !version) return
    setConfirmOpen(false)
    setRunning(true)
    setReadBack(null)
    uploadSection.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    const plan: { id: StepId; path: string; bytes: ArrayBuffer; type: string; cache: string; upsert: boolean }[] = [
      { id: 'bin', path: imagePath(version), bytes: bin.bytes, type: 'application/octet-stream', cache: VERSION_FILE_CACHE_CONTROL, upsert: false },
      { id: 'manifest', path: versionManifestPath(version), bytes: manifest.bytes, type: 'application/json', cache: VERSION_FILE_CACHE_CONTROL, upsert: false },
    ]
    if (channel !== 'none') {
      plan.push({ id: 'pointer', path: pointerPath(channel), bytes: manifest.bytes, type: 'application/json', cache: POINTER_CACHE_CONTROL, upsert: true })
    }
    if (channel === 'none') setStep('pointer', { status: 'skipped' })

    try {
      // Immutability, asked once more at the last moment (another admin may
      // have published the same number since the check above ran).
      if (steps.bin.status !== 'pass') {
        const exists = await versionFolderExists(version)
        if (exists) {
          setExistence({ state: 'known', exists: true })
          setStep('bin', {
            status: 'fail',
            error: { message: `${version}/ already exists in the bucket`, statusCode: '409' },
          })
          return
        }
      }
      for (const step of plan) {
        if (steps[step.id].status === 'pass') continue
        setStep(step.id, { status: 'running' })
        const res = await uploadObject(step.path, step.bytes, step.type, step.cache, step.upsert)
        if (!res.ok) {
          setStep(step.id, { status: 'fail', error: res.error })
          return // never write the pointer when an earlier step failed
        }
        setStep(step.id, { status: 'pass' })
      }
      if (channel !== 'none') {
        // Open apps check at once (see announceRelease).
        void announceRelease(channel, version)
        const back = await readPointer(channel)
        setReadBack(
          back.status === 'ok'
            ? back.manifest.sha256 === validation?.manifest?.sha256
              ? `${channel} now serves ${back.manifest.version} (read back through the public URL).`
              : `${channel} answered ${back.manifest.version} with a different hash; refresh in a minute.`
            : `Reading ${channel} back gave “${back.status}”; refresh in a minute.`
        )
      }
      onPublished()
    } catch (e) {
      setStep(steps.bin.status === 'pass' ? 'manifest' : 'bin', {
        status: 'fail',
        error: { message: e instanceof Error ? e.message : String(e) },
      })
    } finally {
      setRunning(false)
    }
  }

  const failed = Object.values(steps).some((s) => s.status === 'fail')
  const finished =
    steps.bin.status === 'pass' &&
    steps.manifest.status === 'pass' &&
    (channel === 'none' || steps.pointer.status === 'pass')

  const plannedRows: { id: StepId; path: string; type: string; cache: string; upsert: boolean }[] = version
    ? [
        { id: 'bin', path: imagePath(version), type: 'application/octet-stream', cache: VERSION_FILE_CACHE_CONTROL, upsert: false },
        { id: 'manifest', path: versionManifestPath(version), type: 'application/json', cache: VERSION_FILE_CACHE_CONTROL, upsert: false },
        ...(channel !== 'none'
          ? [{ id: 'pointer' as const, path: pointerPath(channel), type: 'application/json', cache: POINTER_CACHE_CONTROL, upsert: true }]
          : []),
      ]
    : []

  const currentOn = (c: Channel) => {
    const p = state?.pointers[c]
    return p?.status === 'ok' ? p.manifest.version : null
  }

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !running && onOpenChange(o)}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0">
            <SheetTitle>Publish a firmware release</SheetTitle>
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
                Drop <span className="font-mono">proxima2_brain.bin</span> and its{' '}
                <span className="font-mono">manifest.json</span> here, together or one at a time
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={started || running} onClick={() => binInput.current?.click()}>
                  Choose .bin
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={started || running}
                  onClick={() => manifestInput.current?.click()}
                >
                  Choose manifest.json
                </Button>
              </div>
              <input
                ref={binInput}
                type="file"
                accept=".bin,application/octet-stream"
                className="hidden"
                onChange={(e) => {
                  void takeFiles([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
              <input
                ref={manifestInput}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  void takeFiles([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
            </div>
            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Image</dt>
              <dd className="truncate font-mono text-xs">
                {bin ? `${bin.name} · ${bin.bytes.byteLength.toLocaleString()} bytes` : '—'}
                
              </dd>
              <dt className="text-muted-foreground">Manifest</dt>
              <dd className="truncate font-mono text-xs">{manifest ? manifest.name : '—'}</dd>
            </dl>
            {manifest && manifest.name !== 'manifest.json' && (
              <p className="text-xs text-muted-foreground">
                It is stored as <span className="font-mono">{version ?? '<version>'}/manifest.json</span>, byte for byte.
              </p>
            )}
          </section>

          {/* 2. Checks */}
          {(validation || bin || manifest) && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">2. Checks before upload</h3>
                {bin && manifest && !started && (
                  <Button variant="ghost" size="xs" disabled={evaluating || running} onClick={() => void evaluate(bin, manifest)}>
                    Run checks again
                  </Button>
                )}
              </div>
              {!validation ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  {evaluating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Hashing the image and asking the bucket…
                    </>
                  ) : (
                    'Waiting for both files.'
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
                            'font-mono text-xs break-all',
                            c.status === 'fail' ? 'text-destructive' : 'text-muted-foreground'
                          )}
                        >
                          {c.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {validation?.manifest && (
                <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/30 p-3 text-sm">
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="font-mono">{validation.manifest.version}</dd>
                  <dt className="text-muted-foreground">Released</dt>
                  <dd>{formatWhen(validation.manifest.released)}</dd>
                  <dt className="text-muted-foreground">Size</dt>
                  <dd>{formatBytes(validation.manifest.size)}</dd>
                  <dt className="text-muted-foreground">hw_rev / app</dt>
                  <dd className="font-mono text-xs">
                    {validation.manifest.hw_rev?.join(', ')} · min_app {validation.manifest.min_app}
                  </dd>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd>{validation.manifest.notes ?? '—'}</dd>
                </dl>
              )}
            </section>
          )}

          {/* 3. Channel */}
          {validation?.manifest && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">3. Channel (optional)</h3>
              <div className="flex w-fit items-center gap-1 rounded-lg border p-0.5">
                {(['none', 'beta', 'stable'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={running || (started && steps.pointer.status === 'pass')}
                    onClick={() => setChannel(c)}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                      channel === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {c === 'none' ? 'Upload only' : `Also point ${c} at it`}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {channel === 'none'
                  ? 'The version is uploaded but no phone is offered it. You can promote it later from Channels.'
                  : `Every phone on ${channel} will be offered ${version} on its next connect (today ${channel} ${
                      currentOn(channel) ? `points at ${currentOn(channel)}` : 'is empty'
                    }). Nothing installs until the user taps Install.`}
              </p>
              {channel === 'stable' && (
                <Notice tone="warning">
                  Stable is what every customer's phone reads. The written rule is 48 h on the beta canary lamp first.
                </Notice>
              )}
            </section>
          )}

          {/* 4. Upload */}
          {plannedRows.length > 0 && validation?.manifest && (
            <section ref={uploadSection} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">4. Upload, in this order</h3>
              <ol className="divide-y rounded-lg border">
                {plannedRows.map((row, i) => {
                  const s = steps[row.id]
                  return (
                    <li key={row.id} className="flex flex-col gap-1.5 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2.5">
                        <CheckIcon status={s.status === 'pass' ? 'pass' : s.status === 'fail' ? 'fail' : s.status === 'running' ? 'running' : 'pending'} />
                        <span className="w-4 text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs break-all">{row.path}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {row.type} · cacheControl {row.cache} · upsert {String(row.upsert)}
                          </p>
                        </div>
                      </div>
                      {s.error && <StorageErrorBox error={s.error} />}
                    </li>
                  )
                })}
              </ol>
              {failed && steps.bin.status !== 'pass' && (
                <p className="text-xs text-muted-foreground">Nothing was written. Fix the cause and retry.</p>
              )}
              {failed && steps.bin.status === 'pass' && (
                <p className="text-xs text-muted-foreground">
                  The steps marked done are in the bucket for good. Retry resumes at the failed step; the channel pointer is
                  never written until both version files are up.
                </p>
              )}
              {finished && (
                <Notice title={`${version} is published`}>
                  {channel === 'none' ? 'No channel was moved.' : readBack}
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
              {started || failed ? 'Retry remaining steps' : version ? `Publish ${version}` : 'Publish'}
            </Button>
          )}
        </div>

        {/* Inside the sheet's popup so base-ui treats it as a nested dialog. */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="data-[size=default]:sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Publish {version}?</AlertDialogTitle>
              <AlertDialogDescription render={<div />}>
                <div className="flex flex-col gap-2 text-left">
                  <p>
                    <span className="font-mono">{version}/</span> becomes permanent: its two files can never be replaced or
                    deleted. A mistake is fixed only by publishing a new version number.
                  </p>
                  <p>
                    {channel === 'none' ? (
                      'No channel is moved, so no phone is offered it yet.'
                    ) : (
                      <strong className="text-foreground">
                        Every phone on {channel} will be offered {version} on its next connect.
                      </strong>
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

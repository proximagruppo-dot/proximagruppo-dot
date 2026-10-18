/**
 * Phone and watch app releases (side-loaded APKs for testers, no store), as pure
 * functions.
 *
 * Contract (mobile-app-inizial/mobile/supabase/009_app_releases.sql, public bucket
 * `apps`; the release script and both apps are built against the same rules):
 *
 *   <app>/latest.json                 pointer: a byte copy of one release.json
 *                                     (cacheControl 0, upsert true)
 *   <app>/<versionCode>/release.json  immutable release record (cacheControl 31536000)
 *   <app>/<versionCode>/<file>.apk    immutable APKs, at the `path` release.json names
 *
 * Same rules as lamp firmware (lib/firmware.ts): released bytes never change, bytes
 * go up before the pointer names them, and "make current" / "roll back" both mean
 * copying a different release.json over the pointer.
 *
 * This file only imports the import-free lib/firmware.ts, by relative path with its
 * extension, so the same code can be checked with plain `node` (Node 22.18+ strips
 * the types) against a real or a fake release.
 */
import { sha256Hex } from './firmware.ts'

export { sha256Hex }

export const APPS_BUCKET = 'apps'
export type AppId = 'phone' | 'watch'
export const APP_IDS: AppId[] = ['phone', 'watch']

export const APP_LABEL: Record<AppId, string> = { phone: 'Phone', watch: 'Watch' }
/** Which device a release ends up on, for sentences like "every tester's phone". */
export const APP_DEVICE: Record<AppId, string> = { phone: 'phone', watch: 'watch' }

/** The Android applicationId each app is signed and installed as. An APK for any
 *  other package would install as a second app instead of updating this one. */
export const APP_PACKAGE: Record<AppId, string> = {
  phone: 'com.hamed.drzi.PROXIMAapp',
  watch: 'com.woodshking.watch_app_test1',
}

/** The ABI keys each app looks up in `apks`. The phone picks the APK for its own
 *  CPU (arm64-v8a on every current phone); the watch takes the single `any`. */
export const KNOWN_PHONE_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86']
export const REQUIRED_ABI: Record<AppId, string> = { phone: 'arm64-v8a', watch: 'any' }

/** Supabase Free plan: 50 MB per file. The bucket's file_size_limit is the same. */
export const MAX_APK_BYTES = 52428800

export const APK_CONTENT_TYPE = 'application/vnd.android.package-archive'
export const JSON_CONTENT_TYPE = 'application/json'
export const RELEASE_FILE_CACHE_CONTROL = '31536000'
export const POINTER_CACHE_CONTROL = '0'
export const RELEASE_FILE = 'release.json'

export const latestPath = (app: AppId) => `${app}/latest.json`
export const versionFolder = (app: AppId, versionCode: number) => `${app}/${versionCode}/`
export const releasePath = (app: AppId, versionCode: number) => `${app}/${versionCode}/${RELEASE_FILE}`

export const appsPublicBase = (supabaseUrl: string) =>
  `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${APPS_BUCKET}`
/** What an `apks[*].url` has to be for a file at `path` in this project. */
export const appsPublicUrl = (supabaseUrl: string, path: string) => `${appsPublicBase(supabaseUrl)}/${path}`

/** The local file name next to release.json: the last segment of `path`. */
export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export const isAppId = (v: unknown): v is AppId => v === 'phone' || v === 'watch'

export interface ApkEntry {
  path: string
  url: string
  sha256: string
  size: number
  [extra: string]: unknown
}

export interface AppRelease {
  schema: 1
  app: AppId
  package: string
  versionCode: number
  versionName: string
  released?: string
  notes?: string
  apks: Record<string, ApkEntry>
  [extra: string]: unknown
}

export type ParseResult = { ok: true; release: AppRelease } | { ok: false; error: string }

/** Parses a release.json and checks every field the apps rely on. Unknown fields
 *  are kept (fields are only ever added). */
export function parseRelease(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `not valid JSON (${e instanceof Error ? e.message : String(e)})` }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not a JSON object' }
  const r = raw as Record<string, unknown>
  const problems: string[] = []
  if (r.schema !== 1) problems.push(`schema is ${JSON.stringify(r.schema)}, expected 1`)
  if (!isAppId(r.app)) problems.push(`app is ${JSON.stringify(r.app)}, expected "phone" or "watch"`)
  if (typeof r.package !== 'string' || !r.package) problems.push('package missing')
  if (typeof r.versionCode !== 'number' || !Number.isSafeInteger(r.versionCode) || r.versionCode <= 0)
    problems.push('versionCode is not a positive integer')
  if (typeof r.versionName !== 'string' || !r.versionName.trim()) problems.push('versionName missing')
  if (r.released !== undefined && typeof r.released !== 'string') problems.push('released is not a string')
  if (r.notes !== undefined && typeof r.notes !== 'string') problems.push('notes is not a string')
  if (!r.apks || typeof r.apks !== 'object' || Array.isArray(r.apks) || Object.keys(r.apks).length === 0) {
    problems.push('apks is not a non-empty object')
  } else {
    for (const [abi, v] of Object.entries(r.apks as Record<string, unknown>)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        problems.push(`apks["${abi}"] is not an object`)
        continue
      }
      const a = v as Record<string, unknown>
      if (typeof a.path !== 'string' || !a.path) problems.push(`apks["${abi}"].path missing`)
      if (typeof a.url !== 'string' || !a.url) problems.push(`apks["${abi}"].url missing`)
      if (typeof a.sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(a.sha256))
        problems.push(`apks["${abi}"].sha256 is not 64 hex characters`)
      if (typeof a.size !== 'number' || !Number.isSafeInteger(a.size) || a.size <= 0)
        problems.push(`apks["${abi}"].size is not a positive integer`)
    }
  }
  if (problems.length > 0) return { ok: false, error: problems.join('; ') }
  return { ok: true, release: r as unknown as AppRelease }
}

/** 'warn' never blocks the upload; it only limits what may follow it (see 'newer'). */
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'pending'

export interface ReleaseCheck {
  id: string
  label: string
  status: CheckStatus
  /** One line per APK where it applies. */
  detail: string
}

export interface PickedApk {
  name: string
  bytes: ArrayBuffer | Uint8Array
  /** Precomputed, so a UI need not hash the same 45 MB twice. */
  sha256?: string
}

/** What the app's pointer says today, as far as the checks care. */
export type LatestKnown =
  | { status: 'empty' }
  | { status: 'ok'; versionCode: number; versionName: string }
  | { status: 'invalid'; error: string }
  | { status: 'unknown'; error?: string }

export interface ValidateInput {
  /** release.json, as the exact text that will be uploaded. */
  releaseText: string
  /** Every .apk that was dropped or picked, by local file name. */
  apks: PickedApk[]
  /** This project's Supabase URL, e.g. https://<ref>.supabase.co */
  supabaseUrl: string
  /** Set when the sheet was opened for one app: the release must be for it. */
  expectedApp?: AppId
  /** Whether `<app>/<versionCode>/` already holds anything; undefined = not known
   *  yet (the check stays pending, and so blocks the upload). */
  versionExists?: boolean
  /** The app's current latest.json. */
  latest?: LatestKnown
}

export interface ApkMatch {
  abi: string
  entry: ApkEntry
  file: PickedApk | null
  sha256: string | null
  size: number | null
}

export interface ReleaseValidation {
  release: AppRelease | null
  /** One row per `apks` entry, with the dropped file it names (if any). */
  matches: ApkMatch[]
  /** Dropped .apk files no `path` names: they are not uploaded. */
  unused: string[]
  checks: ReleaseCheck[]
  /** No check failed or is pending: uploading is allowed. */
  ok: boolean
  /** versionCode is above the current latest (or there is none): the pointer may
   *  be moved to it. When false, the folder may still be uploaded, not made current. */
  mayBecomeCurrent: boolean
}

const fmt = (n: number) => n.toLocaleString('en-US')
const bytesOf = (b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b : new Uint8Array(b))

/**
 * Every pre-upload check: the record itself, the APKs it names against the files
 * that were dropped (presence, size, sha256), the Free-plan size limit, the public
 * URLs, the folder layout, immutability of the version folder, and whether the
 * versionCode would actually be installed by a tester (only a higher one is).
 */
export async function validateAppRelease(input: ValidateInput): Promise<ReleaseValidation> {
  const parsed = parseRelease(input.releaseText)
  const release = parsed.ok ? parsed.release : null
  const checks: ReleaseCheck[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail })
  const lines = (rows: { ok: boolean; text: string }[]) => ({
    ok: rows.every((r) => r.ok),
    detail: rows.map((r) => `${r.ok ? '✓' : '✗'} ${r.text}`).join('\n'),
  })

  add(
    'record',
    'release.json is valid (schema 1, versionCode, versionName, apks)',
    parsed.ok ? 'pass' : 'fail',
    parsed.ok
      ? `${parsed.release.app} ${parsed.release.versionName} (versionCode ${parsed.release.versionCode}), ${Object.keys(parsed.release.apks).length} APK(s)`
      : parsed.error
  )

  const byName = new Map(input.apks.map((f) => [f.name, f]))
  const matches: ApkMatch[] = []
  if (release) {
    for (const [abi, entry] of Object.entries(release.apks)) {
      const file = byName.get(basename(entry.path)) ?? null
      const sha256 = file ? (file.sha256 ?? (await sha256Hex(bytesOf(file.bytes)))) : null
      matches.push({ abi, entry, file, sha256, size: file ? bytesOf(file.bytes).byteLength : null })
    }
  }
  const named = new Set(matches.map((m) => basename(m.entry.path)))
  const unused = input.apks.map((f) => f.name).filter((n) => !named.has(n))

  if (!release) {
    for (const [id, label] of [
      ['app', 'app and package are the expected pair'],
      ['abis', 'APK set is the one the app looks up'],
      ['present', 'Every APK named in apks was dropped'],
      ['size', 'File sizes equal apks[*].size'],
      ['sha256', 'sha256 of each file equals apks[*].sha256'],
      ['limit', `Each APK is within the 50 MB per-file limit`],
      ['path', 'Each path is inside <app>/<versionCode>/'],
      ['url', 'Each url is this project’s public URL for its path'],
      ['fresh', 'Version folder does not exist yet'],
      ['newer', 'versionCode is higher than the current latest'],
    ] as const)
      add(id, label, 'fail', 'needs a valid release.json')
    return { release, matches, unused, checks, ok: false, mayBecomeCurrent: false }
  }

  const app = release.app
  const vc = release.versionCode

  // app / package
  {
    const pkgOk = release.package === APP_PACKAGE[app]
    const appOk = input.expectedApp === undefined || input.expectedApp === app
    add(
      'app',
      `app and package are the expected pair${input.expectedApp ? ` (${input.expectedApp})` : ''}`,
      pkgOk && appOk ? 'pass' : 'fail',
      [
        !appOk ? `this is a ${app} release, but you are publishing to ${input.expectedApp}` : null,
        pkgOk
          ? `${app} → ${release.package}`
          : `${app} must be ${APP_PACKAGE[app]}, release.json says ${release.package}: it would install as a separate app, not as an update`,
      ]
        .filter(Boolean)
        .join('\n')
    )
  }

  // ABI keys
  {
    const keys = Object.keys(release.apks)
    const required = REQUIRED_ABI[app]
    const allowed = app === 'phone' ? KNOWN_PHONE_ABIS : ['any']
    const unknown = keys.filter((k) => !allowed.includes(k))
    const ok = keys.includes(required) && unknown.length === 0
    add(
      'abis',
      'APK set is the one the app looks up',
      ok ? 'pass' : 'fail',
      ok
        ? keys.join(', ')
        : [
            !keys.includes(required) ? `"${required}" is missing: the ${app} app looks for it` : null,
            unknown.length ? `unknown key(s) ${unknown.map((k) => `"${k}"`).join(', ')}; allowed: ${allowed.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join('\n')
    )
  }

  // presence (match by basename of path)
  {
    const r = lines(
      matches.map((m) => ({
        ok: m.file !== null,
        text: m.file ? `${m.abi}: ${m.file.name}` : `${m.abi}: ${basename(m.entry.path)} was not dropped`,
      }))
    )
    add('present', 'Every APK named in apks was dropped', r.ok ? 'pass' : 'fail', r.detail)
  }

  // size
  {
    const r = lines(
      matches.map((m) => ({
        ok: m.size !== null && m.size === m.entry.size,
        text:
          m.size === null
            ? `${m.abi}: no file`
            : m.size === m.entry.size
              ? `${m.abi}: ${fmt(m.size)} bytes`
              : `${m.abi}: file ${fmt(m.size)} ≠ release.json ${fmt(m.entry.size)} bytes`,
      }))
    )
    add('size', 'File sizes equal apks[*].size', r.ok ? 'pass' : 'fail', r.detail)
  }

  // sha256
  {
    const r = lines(
      matches.map((m) => {
        const want = m.entry.sha256.toLowerCase()
        return {
          ok: m.sha256 !== null && m.sha256 === want,
          text:
            m.sha256 === null
              ? `${m.abi}: no file`
              : m.sha256 === want
                ? `${m.abi}: ${m.sha256}`
                : `${m.abi}: file ${m.sha256} ≠ release.json ${want}`,
        }
      })
    )
    add('sha256', 'sha256 of each file equals apks[*].sha256', r.ok ? 'pass' : 'fail', r.detail)
  }

  // Free-plan per-file limit (judged on the real file when there is one)
  {
    const rows = matches.map((m) => {
      const n = m.size ?? m.entry.size
      return { ok: n > 0 && n <= MAX_APK_BYTES, text: `${m.abi}: ${fmt(n)} bytes${n > MAX_APK_BYTES ? ` — ${fmt(n - MAX_APK_BYTES)} over` : ''}` }
    })
    const r = lines(rows)
    add(
      'limit',
      `Each APK is within the 50 MB per-file limit (≤ ${fmt(MAX_APK_BYTES)} bytes)`,
      r.ok ? 'pass' : 'fail',
      r.ok
        ? r.detail
        : `${r.detail}\nThe Supabase Free plan refuses any single file over 50 MB, and the bucket's file_size_limit is set to the same. Build one APK per ABI (split per ABI) or make the build smaller; a universal APK with every ABI is about 103 MB.`
    )
  }

  // path layout
  {
    const prefix = versionFolder(app, vc)
    const seen = new Set<string>()
    const rows = matches.map((m) => {
      const p = m.entry.path
      const name = p.startsWith(prefix) ? p.slice(prefix.length) : ''
      const problems: string[] = []
      if (!p.startsWith(prefix)) problems.push(`not under ${prefix}`)
      else if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,127}\.apk$/.test(name) || name.includes('..'))
        problems.push('the file name must be one plain segment ending in .apk')
      if (seen.has(p)) problems.push('used by two entries')
      seen.add(p)
      return { ok: problems.length === 0, text: `${m.abi}: ${p}${problems.length ? ` — ${problems.join('; ')}` : ''}` }
    })
    const r = lines(rows)
    add('path', `Each path is inside ${prefix}`, r.ok ? 'pass' : 'fail', r.detail)
  }

  // url
  {
    const rows = matches.map((m) => {
      const want = appsPublicUrl(input.supabaseUrl, m.entry.path)
      return {
        ok: m.entry.url === want,
        text: m.entry.url === want ? `${m.abi}: ${m.entry.url}` : `${m.abi}: expected ${want}, release.json has ${m.entry.url}`,
      }
    })
    const r = lines(rows)
    add('url', 'Each url is this project’s public URL for its path', r.ok ? 'pass' : 'fail', r.detail)
  }

  // immutability
  add(
    'fresh',
    'Version folder does not exist yet',
    input.versionExists === undefined ? 'pending' : input.versionExists ? 'fail' : 'pass',
    input.versionExists === undefined
      ? 'checking the bucket…'
      : input.versionExists
        ? `${versionFolder(app, vc)} already exists. Released files never change: build again with a higher versionCode.`
        : `${versionFolder(app, vc)} is free`
  )

  // newer than the current latest
  let mayBecomeCurrent = false
  {
    const latest = input.latest ?? { status: 'unknown' }
    let status: CheckStatus
    let detail: string
    if (latest.status === 'unknown') {
      status = 'pending'
      detail = latest.error ? `could not read ${latestPath(app)}: ${latest.error}` : `reading ${latestPath(app)}…`
    } else if (latest.status === 'empty') {
      status = 'pass'
      mayBecomeCurrent = true
      detail = `${latestPath(app)} does not exist yet: this will be the first ${app} release`
    } else if (latest.status === 'invalid') {
      status = 'pass'
      mayBecomeCurrent = true
      detail = `${latestPath(app)} is not a valid release (${latest.error}); making this current replaces it`
    } else if (vc > latest.versionCode) {
      status = 'pass'
      mayBecomeCurrent = true
      detail = `${vc} > current ${latest.versionCode} (${latest.versionName})`
    } else {
      status = 'warn'
      detail =
        `${vc} is not higher than the current ${latest.versionCode} (${latest.versionName}). ` +
        `A ${APP_DEVICE[app]} only installs a higher versionCode, so testers would not be offered it. ` +
        'It can be uploaded, but not made current here; to roll back use the app card.'
    }
    add('newer', 'versionCode is higher than the current latest', status, detail)
  }

  const ok = checks.every((c) => c.status === 'pass' || c.status === 'warn')
  return { release, matches, unused, checks, ok, mayBecomeCurrent: ok && mayBecomeCurrent }
}

/** Turns a Storage error into what an admin can act on. The raw message is always
 *  shown next to this, verbatim. */
export function explainAppStorageError(
  err: { message?: string; status?: number; statusCode?: string } | null | undefined
): string {
  if (!err) return ''
  const msg = (err.message ?? '').toLowerCase()
  const codes = [Number(err.status ?? 0), Number(err.statusCode ?? 0)]
  const is = (c: number) => codes.includes(c)
  if (msg.includes('row-level security') || msg.includes('row level security') || is(403) || msg.includes('unauthorized') || msg.includes('access denied'))
    return 'Supabase refused the write. Either your account is not an admin (no row in public.admins, so is_admin() is false), or the policies of 009_app_releases.sql are not installed, or this path may not be overwritten: only phone/latest.json and watch/latest.json can be.'
  if (msg.includes('already exists') || msg.includes('duplicate') || is(409))
    return 'This file is already in the bucket. Release folders are immutable: a fix is always a new versionCode.'
  if (msg.includes('bucket not found'))
    return 'The "apps" bucket does not exist in this project yet. Run supabase/009_app_releases.sql first.'
  if (msg.includes('maximum allowed size') || msg.includes('too large') || msg.includes('exceeded') || is(413))
    return 'The file is larger than the bucket allows: 50 MB per file on the Supabase Free plan.'
  if (msg.includes('mime type') || is(415))
    return 'The bucket only accepts APKs (application/vnd.android.package-archive), application/octet-stream and application/json.'
  if (msg.includes('jwt') || is(401))
    return 'Your session has expired. Sign out and sign in again, then retry.'
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return 'The request did not reach Supabase (network or browser blocked it). Nothing was written by this step.'
  return 'Unexpected error from Supabase Storage.'
}

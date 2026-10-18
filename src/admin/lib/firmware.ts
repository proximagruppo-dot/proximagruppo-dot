/**
 * Lamp firmware release rules, as pure functions.
 *
 * Everything here follows Ali's firmware release contract
 * (ali/PROXIMA_firmware_0.9.11_backoffice/PROXIMA-Firmware-Release-Path.html, §0 and §5):
 *
 *  - Released bytes never change: a version folder is written once.
 *  - Bytes before pointer: the image and its manifest go up before any channel
 *    pointer names them.
 *  - A channel is a copy of one version's manifest. Promote, roll back and
 *    "pause" all mean copying a different manifest over the channel file.
 *  - Readers need version, url, sha256 and size and ignore unknown fields.
 *
 * This file deliberately imports nothing (type imports only), so the very same
 * code can be unit-checked with plain `node` against a real release package.
 */

export const FIRMWARE_BUCKET = 'firmware'
export const FIRMWARE_DEVICE = 'proxima2_brain'
export const IMAGE_FILE = 'proxima2_brain.bin'
export const VERSION_MANIFEST_FILE = 'manifest.json'

/** The lamp's OTA slot (0x1E0000). The bucket's file_size_limit is the same number. */
export const MAX_IMAGE_BYTES = 1966080

export type Channel = 'beta' | 'stable'
export const CHANNELS: Channel[] = ['beta', 'stable']

/** Upload options, verbatim from Ali's §0 table. */
export const VERSION_FILE_CACHE_CONTROL = '31536000'
export const POINTER_CACHE_CONTROL = '0'

export const pointerPath = (channel: Channel) =>
  channel === 'stable' ? `${FIRMWARE_DEVICE}/manifest.json` : `${FIRMWARE_DEVICE}/manifest-beta.json`
export const imagePath = (version: string) => `${FIRMWARE_DEVICE}/${version}/${IMAGE_FILE}`
export const versionManifestPath = (version: string) => `${FIRMWARE_DEVICE}/${version}/${VERSION_MANIFEST_FILE}`

/** Public, unauthenticated base of the bucket -- what phones read. */
export const publicBucketBase = (supabaseUrl: string) =>
  `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${FIRMWARE_BUCKET}`
export const publicObjectUrl = (supabaseUrl: string, path: string) => `${publicBucketBase(supabaseUrl)}/${path}`
/** What `manifest.url` has to be for an image published to this project. */
export const expectedImageUrl = (supabaseUrl: string, version: string) =>
  publicObjectUrl(supabaseUrl, imagePath(version))

export interface FirmwareManifest {
  schema?: number
  device: string
  version: string
  url: string
  sha256: string
  size: number
  hw_rev?: string[]
  min_app?: string
  released?: string
  notes?: string
  git?: string
  [extra: string]: unknown
}

/** A version string becomes a path segment, so it must be one plain segment. */
export const isSafeVersion = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(v) && !v.includes('..')

export type ParseResult = { ok: true; manifest: FirmwareManifest } | { ok: false; error: string }

/** Parses a manifest and checks the fields every reader relies on. Unknown fields
 *  are kept (fields are only ever added). */
export function parseManifest(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `not valid JSON (${e instanceof Error ? e.message : String(e)})` }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not a JSON object' }
  const m = raw as Record<string, unknown>
  const problems: string[] = []
  if (typeof m.device !== 'string') problems.push('device missing')
  if (!isSafeVersion(m.version)) problems.push('version missing or not a plain version string')
  if (typeof m.url !== 'string' || !m.url) problems.push('url missing')
  if (typeof m.sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(m.sha256)) problems.push('sha256 is not 64 hex characters')
  if (typeof m.size !== 'number' || !Number.isInteger(m.size) || m.size <= 0) problems.push('size is not a positive integer')
  // The app's updateDecision() reads these two; without them a phone either never
  // offers the release or offers it to boards/apps it should not.
  if (!Array.isArray(m.hw_rev) || m.hw_rev.length === 0 || !m.hw_rev.every((r) => typeof r === 'string'))
    problems.push('hw_rev is not a non-empty list of strings')
  if (typeof m.min_app !== 'string' || !m.min_app) problems.push('min_app missing')
  if (problems.length > 0) return { ok: false, error: problems.join('; ') }
  return { ok: true, manifest: m as unknown as FirmwareManifest }
}

/** SHA-256 as lowercase hex, through WebCrypto (browser and Node 20+ alike). */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', view as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type CheckStatus = 'pass' | 'fail' | 'pending'

export interface ReleaseCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

export interface ReleaseInput {
  /** The .bin, as bytes. */
  image: ArrayBuffer | Uint8Array
  /** The version manifest, as the exact text that will be uploaded. */
  manifestText: string
  /** This project's Supabase URL, e.g. https://<ref>.supabase.co */
  supabaseUrl: string
  /** Whether `proxima2_brain/<version>/` already holds anything. `undefined` =
   *  not known yet (the check stays pending, and so blocks the upload). */
  versionExists?: (version: string) => boolean | undefined
  /** Precomputed hash, so a UI need not hash the same 1.2 MB twice. */
  imageSha256?: string
}

export interface ReleaseValidation {
  manifest: FirmwareManifest | null
  imageSha256: string
  imageSize: number
  checks: ReleaseCheck[]
  /** Every check passed -- the only state in which uploading is allowed. */
  ok: boolean
}

/**
 * Every pre-upload check from Ali's §0 ("every party checks what it receives"),
 * plus the two the bucket would otherwise enforce late: the slot size and the
 * immutability of version folders.
 */
export async function validateRelease(input: ReleaseInput): Promise<ReleaseValidation> {
  const bytes = input.image instanceof Uint8Array ? input.image : new Uint8Array(input.image)
  const imageSize = bytes.byteLength
  const imageSha256 = input.imageSha256 ?? (await sha256Hex(bytes))
  const parsed = parseManifest(input.manifestText)
  const manifest = parsed.ok ? parsed.manifest : null
  const checks: ReleaseCheck[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail })

  add(
    'manifest',
    'Manifest is valid',
    parsed.ok ? 'pass' : 'fail',
    parsed.ok ? `version ${parsed.manifest.version}, schema ${parsed.manifest.schema ?? '—'}` : parsed.error
  )

  if (!manifest) {
    add('device', `device is "${FIRMWARE_DEVICE}"`, 'fail', 'needs a valid manifest')
    add('sha256', 'sha256(bin) equals manifest.sha256', 'fail', `bin is ${imageSha256}`)
    add('size', 'bin size equals manifest.size', 'fail', `bin is ${imageSize} bytes`)
  } else {
    add(
      'device',
      `device is "${FIRMWARE_DEVICE}"`,
      manifest.device === FIRMWARE_DEVICE ? 'pass' : 'fail',
      `manifest says "${manifest.device}"`
    )
    const shaOk = manifest.sha256.toLowerCase() === imageSha256
    add(
      'sha256',
      'sha256(bin) equals manifest.sha256',
      shaOk ? 'pass' : 'fail',
      shaOk ? imageSha256 : `bin ${imageSha256} ≠ manifest ${manifest.sha256}`
    )
    add(
      'size',
      'bin size equals manifest.size',
      manifest.size === imageSize ? 'pass' : 'fail',
      manifest.size === imageSize
        ? `${imageSize.toLocaleString('en-US')} bytes`
        : `bin ${imageSize.toLocaleString('en-US')} ≠ manifest ${manifest.size.toLocaleString('en-US')} bytes`
    )
  }

  add(
    'slot',
    `Image fits the lamp's OTA slot (≤ ${MAX_IMAGE_BYTES.toLocaleString('en-US')} bytes)`,
    imageSize > 0 && imageSize <= MAX_IMAGE_BYTES ? 'pass' : 'fail',
    `${imageSize.toLocaleString('en-US')} bytes`
  )

  if (!manifest) {
    add('url', 'manifest.url names the path the image is going to', 'fail', 'needs a valid manifest')
    add('fresh', 'Version folder does not exist yet', 'fail', 'needs a valid manifest')
  } else {
    const expected = expectedImageUrl(input.supabaseUrl, manifest.version)
    add(
      'url',
      'manifest.url names the path the image is going to',
      manifest.url === expected ? 'pass' : 'fail',
      manifest.url === expected ? manifest.url : `expected ${expected}, manifest has ${manifest.url}`
    )
    const exists = input.versionExists?.(manifest.version)
    add(
      'fresh',
      'Version folder does not exist yet',
      exists === undefined ? 'pending' : exists ? 'fail' : 'pass',
      exists === undefined
        ? 'checking the bucket…'
        : exists
          ? `${FIRMWARE_DEVICE}/${manifest.version}/ already exists. Released bytes never change: publish a new version number.`
          : `${FIRMWARE_DEVICE}/${manifest.version}/ is free`
    )
  }

  return { manifest, imageSha256, imageSize, checks, ok: checks.every((c) => c.status === 'pass') }
}

/** Numeric-aware version compare ("0.9.11" > "0.9.9"). Negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/)
  const pb = b.split(/[.+-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? ''
    const y = pb[i] ?? ''
    if (x === y) continue
    const nx = /^\d+$/.test(x) ? Number(x) : NaN
    const ny = /^\d+$/.test(y) ? Number(y) : NaN
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny
    if (x === '') return -1
    if (y === '') return 1
    return x < y ? -1 : 1
  }
  return 0
}

export type FleetStatus = 'up_to_date' | 'behind' | 'ahead' | 'unknown'

/** Where a lamp stands against a channel. The app offers anything *different*
 *  from what the lamp runs (not only newer), so "ahead" lamps will be offered the
 *  channel's older version too -- that is how a rollback reaches them. */
export function fleetStatus(lampVersion: string | null | undefined, channelVersion: string | null | undefined): FleetStatus {
  const lamp = (lampVersion ?? '').trim()
  if (!lamp || lamp === 'unknown' || !channelVersion) return 'unknown'
  const cmp = compareVersions(lamp, channelVersion)
  return cmp === 0 ? 'up_to_date' : cmp < 0 ? 'behind' : 'ahead'
}

/** Lamp OTA error codes, from Ali's §7 table (full list in
 *  Firmware_P2/tools/bleota/push.py). */
export const LAMP_ERRORS: Record<number, { meaning: string; cause: string }> = {
  0: { meaning: 'none', cause: '' },
  2: { meaning: 'image does not fit the slot', cause: 'wrong file' },
  7: { meaning: 'SHA-256 mismatch', cause: 'the Bluetooth link corrupted the image' },
  8: { meaning: "image rejected by the lamp's verifier", cause: 'not a valid image' },
  13: { meaning: 'link dropped mid-transfer', cause: 'phone moved away, app killed' },
  14: { meaning: 'writer did not keep up', cause: 'lamp-side fault, rare' },
  15: { meaning: 'checkpoint mismatch: packets lost', cause: 'weak signal' },
  16: { meaning: 'lamp is still proving its last update', cause: 'install attempted right after another; retry in about 3 min' },
  17: { meaning: 'abandoned: no progress for 120 s', cause: 'app paused or stopped mid-transfer (0.9.11 and later)' },
}

export function lampErrorText(code: number | null | undefined): string {
  if (code === null || code === undefined) return ''
  const e = LAMP_ERRORS[code]
  if (!e) return `code ${code}: not in the backoffice table (see Firmware_P2/tools/bleota/push.py)`
  return e.cause ? `${e.meaning} — ${e.cause}` : e.meaning
}

export const INSTALL_RESULTS = [
  'ok',
  'download_failed',
  'transfer_failed',
  'rolled_back',
  'cancelled',
  'reconnect_failed',
] as const

/** Turns a Storage error into what an admin can act on. The raw message is always
 *  shown next to this, verbatim. */
export function explainStorageError(err: { message?: string; status?: number; statusCode?: string } | null | undefined): string {
  if (!err) return ''
  const msg = (err.message ?? '').toLowerCase()
  // Storage answers e.g. HTTP 400 with statusCode "403" in the body: look at both.
  const codes = [Number(err.status ?? 0), Number(err.statusCode ?? 0)]
  const is = (c: number) => codes.includes(c)
  if (msg.includes('row-level security') || msg.includes('row level security') || is(403) || msg.includes('unauthorized') || msg.includes('access denied'))
    return 'Supabase refused the write. Either your account is not an admin (it has no row in public.admins, so is_admin() is false), or the firmware storage policies are not installed, or this path may not be overwritten (only the two channel pointers can be).'
  if (msg.includes('already exists') || msg.includes('duplicate') || is(409))
    return 'This file is already in the bucket. Version folders are immutable: a fix is always a new version number.'
  if (msg.includes('bucket not found'))
    return 'The "firmware" bucket does not exist in this project yet. The firmware SQL (bucket + policies) has to be run first.'
  if (msg.includes('maximum allowed size') || msg.includes('too large') || is(413))
    return "The file is larger than the bucket allows (the lamp's OTA slot, 1 966 080 bytes)."
  if (msg.includes('mime type') || is(415))
    return 'The bucket only accepts application/octet-stream and application/json.'
  if (msg.includes('jwt') || is(401))
    return 'Your session has expired. Sign out and sign in again, then retry.'
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return 'The request did not reach Supabase (network or browser blocked it). Nothing was written by this step.'
  return 'Unexpected error from Supabase Storage.'
}

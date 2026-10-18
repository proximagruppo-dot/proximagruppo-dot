/**
 * Supabase Storage side of lamp firmware: reading the `firmware` bucket the way a
 * phone does (public URLs), and writing to it the way Ali's §0 prescribes.
 *
 * Writes go through the signed-in admin's session and the publishable key only.
 * What may be written is decided by RLS on storage.objects (public.is_admin(),
 * INSERT anywhere in the bucket, UPDATE only the two channel pointers, no DELETE),
 * never by this code.
 */
import { useCallback, useEffect, useState } from 'react'

import {
  CHANNELS,
  FIRMWARE_BUCKET,
  FIRMWARE_DEVICE,
  POINTER_CACHE_CONTROL,
  compareVersions,
  isSafeVersion,
  parseManifest,
  pointerPath,
  publicObjectUrl,
  versionManifestPath,
  imagePath,
  type Channel,
  type FirmwareManifest,
} from '@admin/lib/firmware'
import { SUPABASE_URL, supabaseClient } from '@admin/lib/supabase'

export interface StorageErrorLike {
  message: string
  status?: number
  statusCode?: string
}

export const toErrorLike = (e: unknown): StorageErrorLike => {
  if (e && typeof e === 'object' && 'message' in e) {
    const o = e as { message: unknown; status?: unknown; statusCode?: unknown }
    return {
      message: String(o.message),
      status: typeof o.status === 'number' ? o.status : undefined,
      statusCode: typeof o.statusCode === 'string' ? o.statusCode : undefined,
    }
  }
  return { message: String(e) }
}

/** Public URL of an object in any public bucket of this project (the firmware
 *  bucket's is exactly lib/firmware.ts publicObjectUrl). */
const bucketObjectUrl = (bucket: string, path: string) =>
  bucket === FIRMWARE_BUCKET
    ? publicObjectUrl(SUPABASE_URL, path)
    : `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${path}`

export type PublicFetch = { kind: 'ok'; bytes: ArrayBuffer; text: string } | { kind: 'missing' }

/**
 * GET an object through the public URL, exactly as a phone would.
 * `bust` defeats every cache in between (pointers are cacheControl 0, but a
 * browser or CDN copy from before a move must never be shown as "current").
 * Supabase answers a missing public object with 400 or 404 and a not_found body.
 */
export async function fetchPublic(path: string, bust: boolean, bucket: string = FIRMWARE_BUCKET): Promise<PublicFetch> {
  const url = bucketObjectUrl(bucket, path) + (bust ? `?cb=${Date.now()}` : '')
  const res = await fetch(url, { cache: bust ? 'no-store' : 'default' })
  if (res.ok) {
    const bytes = await res.arrayBuffer()
    return { kind: 'ok', bytes, text: new TextDecoder().decode(bytes) }
  }
  const body = await res.text().catch(() => '')
  if (res.status === 404 || (res.status === 400 && /not.?found/i.test(body))) return { kind: 'missing' }
  throw new Error(`GET ${path} returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
}

/** HEAD an object's public URL: its size when it is there, null when it is not. */
export async function headPublic(path: string, bucket: string = FIRMWARE_BUCKET): Promise<number | null> {
  const res = await fetch(bucketObjectUrl(bucket, path) + `?cb=${Date.now()}`, {
    method: 'HEAD',
    cache: 'no-store',
  })
  if (res.ok) return Number(res.headers.get('content-length') ?? NaN)
  if (res.status === 400 || res.status === 404) return null
  throw new Error(`HEAD ${path} returned HTTP ${res.status}`)
}

/** Version folder names under proxima2_brain/. Needs the admins' SELECT policy. */
export async function listVersionFolders(): Promise<string[]> {
  const { data, error } = await supabaseClient.storage
    .from(FIRMWARE_BUCKET)
    .list(FIRMWARE_DEVICE, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw error
  // Folders come back with id null; the two pointers are files and are skipped.
  return (data ?? []).filter((o) => o.id === null && isSafeVersion(o.name)).map((o) => o.name)
}

/**
 * Whether `proxima2_brain/<version>/` holds anything. Asked two ways -- the
 * bucket listing and the public URLs -- and "exists" if either says so, because
 * refusing a free version is harmless and overwriting a released one is not
 * possible to undo.
 */
export async function versionFolderExists(version: string): Promise<boolean> {
  let listError: unknown = null
  try {
    const { data, error } = await supabaseClient.storage
      .from(FIRMWARE_BUCKET)
      .list(`${FIRMWARE_DEVICE}/${version}`, { limit: 10 })
    if (error) throw error
    if ((data ?? []).length > 0) return true
  } catch (e) {
    listError = e
  }
  try {
    const [bin, man] = await Promise.all([headPublic(imagePath(version)), headPublic(versionManifestPath(version))])
    if (bin !== null || man !== null) return true
  } catch (e) {
    if (listError) throw listError
    throw e
  }
  if (listError) throw listError
  return false
}

export interface ReleaseRow {
  version: string
  manifest: FirmwareManifest | null
  /** Why this folder is not a clean release, if it is not. */
  problem?: string
}

export type PointerState =
  | { status: 'empty' }
  | { status: 'ok'; manifest: FirmwareManifest; text: string }
  | { status: 'invalid'; error: string }
  | { status: 'error'; error: string }

export async function readPointer(channel: Channel): Promise<PointerState> {
  try {
    const got = await fetchPublic(pointerPath(channel), true)
    if (got.kind === 'missing') return { status: 'empty' }
    const parsed = parseManifest(got.text)
    return parsed.ok ? { status: 'ok', manifest: parsed.manifest, text: got.text } : { status: 'invalid', error: parsed.error }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

async function readRelease(version: string): Promise<ReleaseRow> {
  try {
    // Version manifests are immutable and cached for a year, so no cache-bust.
    const got = await fetchPublic(versionManifestPath(version), false)
    if (got.kind === 'missing') return { version, manifest: null, problem: 'incomplete: no manifest.json in this folder' }
    const parsed = parseManifest(got.text)
    if (!parsed.ok) return { version, manifest: null, problem: `manifest.json is not valid: ${parsed.error}` }
    if (parsed.manifest.version !== version)
      return { version, manifest: parsed.manifest, problem: `manifest says version ${parsed.manifest.version}` }
    return { version, manifest: parsed.manifest }
  } catch (e) {
    return { version, manifest: null, problem: e instanceof Error ? e.message : String(e) }
  }
}

export interface FirmwareState {
  releases: ReleaseRow[]
  pointers: Record<Channel, PointerState>
  /** Listing the bucket failed (most often: not an admin, or no bucket yet). */
  listError: StorageErrorLike | null
}

export async function loadFirmwareState(): Promise<FirmwareState> {
  const pointersP = Promise.all(CHANNELS.map((c) => readPointer(c)))
  let versions: string[] = []
  let listError: StorageErrorLike | null = null
  try {
    versions = await listVersionFolders()
  } catch (e) {
    listError = toErrorLike(e)
  }
  const releases = await Promise.all(versions.map(readRelease))
  releases.sort((a, b) => compareVersions(b.version, a.version))
  const [beta, stable] = await pointersP
  return { releases, pointers: { beta, stable }, listError }
}

export function useFirmwareState() {
  const [state, setState] = useState<FirmwareState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // `load` only sets state after an await, so the mount effect never renders
  // twice synchronously; `reload` (a click) also shows the spinner first.
  const load = useCallback(async () => {
    try {
      const next = await loadFirmwareState()
      setState(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const reload = useCallback(() => {
    setLoading(true)
    return load()
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  return { state, loading, error, reload }
}

export type UploadResult = { ok: true } | { ok: false; error: StorageErrorLike }

/** One storage write with exactly the options given. Bytes (not a Blob) are
 *  sent so contentType and cacheControl go out as headers verbatim. */
export async function uploadObject(
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
  cacheControl: string,
  upsert: boolean,
  bucket: string = FIRMWARE_BUCKET
): Promise<UploadResult> {
  try {
    const { error } = await supabaseClient.storage
      .from(bucket)
      .upload(path, bytes, { contentType, cacheControl, upsert })
    if (error) return { ok: false, error: toErrorLike(error) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: toErrorLike(e) }
  }
}

export interface MovePrecheck {
  /** The exact bytes of <version>/manifest.json, to be copied over the pointer. */
  bytes: ArrayBuffer
  manifest: FirmwareManifest
  imageSize: number | null
  problems: string[]
}

/**
 * Everything that has to be true before a channel may point at `version`:
 * the release record is there and valid, names itself, and its image is
 * reachable at the size it claims ("bytes before pointer").
 */
export async function precheckChannelMove(version: string): Promise<MovePrecheck> {
  const got = await fetchPublic(versionManifestPath(version), true)
  if (got.kind === 'missing') throw new Error(`${versionManifestPath(version)} does not exist`)
  const parsed = parseManifest(got.text)
  if (!parsed.ok) throw new Error(`${versionManifestPath(version)} is not a valid manifest: ${parsed.error}`)
  const manifest = parsed.manifest
  const problems: string[] = []
  if (manifest.version !== version) problems.push(`its manifest says version ${manifest.version}, not ${version}`)
  if (manifest.device !== FIRMWARE_DEVICE) problems.push(`its manifest is for device "${manifest.device}"`)
  let imageSize: number | null = null
  try {
    imageSize = await headPublic(imagePath(version))
    if (imageSize === null) problems.push('its image proxima2_brain.bin is not in the bucket')
    else if (Number.isFinite(imageSize) && imageSize !== manifest.size)
      problems.push(`its image is ${imageSize} bytes but the manifest says ${manifest.size}`)
  } catch (e) {
    problems.push(`could not reach its image: ${e instanceof Error ? e.message : String(e)}`)
  }
  return { bytes: got.bytes, manifest, imageSize, problems }
}

/**
 * Tell open apps, right now, that a channel pointer moved.
 *
 * Supabase Realtime BROADCAST on the public topic `firmware-releases`, event
 * `release`, payload { channel, version }. The phone app listens while its lamp is
 * connected and re-reads the pointer the moment this arrives, so a release reaches
 * an open app in about a second instead of on its next poll. The message carries no
 * authority - a phone always reads the real pointer from Storage - so a lost or
 * spoofed message costs at most one extra check. Best effort: never throws.
 */
export const RELEASE_TOPIC = 'firmware-releases'

export function announceRelease(channel: Channel, version: string): Promise<boolean> {
  return broadcastOnce(RELEASE_TOPIC, 'release', { channel, version, at: Date.now() })
}

/** Joins a public Realtime topic, sends one broadcast and leaves. Best effort:
 *  resolves false (never throws) when the topic cannot be joined or the send fails.
 *  Shared by firmware-releases and app-releases (lib/app-release-storage.ts). */
export async function broadcastOnce(topic: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
  const ch = supabaseClient.channel(topic)
  try {
    const joined = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 4000)
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(true) }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { clearTimeout(t); resolve(false) }
      })
    })
    if (!joined) return false
    const res = await ch.send({ type: 'broadcast', event, payload })
    return res === 'ok'
  } catch {
    return false
  } finally {
    supabaseClient.removeChannel(ch).catch(() => {})
  }
}

/** Copies a version's manifest bytes over a channel pointer, then reads the
 *  pointer back through the public URL to prove phones now see it. */
export async function moveChannel(
  channel: Channel,
  pre: MovePrecheck
): Promise<UploadResult & { verified?: boolean; readBack?: string }> {
  const res = await uploadObject(pointerPath(channel), pre.bytes, 'application/json', POINTER_CACHE_CONTROL, true)
  if (!res.ok) return res
  // Open apps check at once (see announceRelease); the read-back below does not wait on it.
  void announceRelease(channel, pre.manifest.version)
  const back = await readPointer(channel)
  if (back.status === 'ok') {
    return { ok: true, verified: back.manifest.sha256 === pre.manifest.sha256, readBack: back.manifest.version }
  }
  return { ok: true, verified: false, readBack: back.status }
}

/**
 * Whether the signed-in account is a backoffice admin, asked of the same
 * public.is_admin() the storage policies use. Only drives a warning and the
 * Publish button; the database decides regardless. null = could not tell.
 */
export function useIsAdmin(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    void supabaseClient.rpc('is_admin').then(({ data, error }) => {
      if (!cancelled && !error && typeof data === 'boolean') setIsAdmin(data)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return isAdmin
}

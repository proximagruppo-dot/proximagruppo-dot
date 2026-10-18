/**
 * Supabase Storage side of phone/watch app releases: reading the `apps` bucket the
 * way the apps do (public URLs, cache-busted for the pointers), and writing to it in
 * the contract's order with the contract's options (see lib/app-releases.ts).
 *
 * Writes go through the signed-in admin's session and the publishable key only.
 * What may be written is decided by RLS on storage.objects (009_app_releases.sql:
 * INSERT anywhere in `apps`, UPDATE only the two latest.json pointers, no DELETE),
 * never by this code. The transport helpers are the firmware ones, given the bucket.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  APPS_BUCKET,
  APP_IDS,
  JSON_CONTENT_TYPE,
  POINTER_CACHE_CONTROL,
  basename,
  latestPath,
  parseRelease,
  releasePath,
  type AppId,
  type AppRelease,
  type LatestKnown,
} from '@admin/lib/app-releases'
import {
  broadcastOnce,
  fetchPublic,
  headPublic,
  toErrorLike,
  uploadObject,
  type StorageErrorLike,
  type UploadResult,
} from '@admin/lib/firmware-storage'
import { supabaseClient } from '@admin/lib/supabase'

export type LatestState =
  | { status: 'empty' }
  | { status: 'ok'; release: AppRelease; text: string }
  | { status: 'invalid'; error: string }
  | { status: 'error'; error: string }

export async function readLatest(app: AppId): Promise<LatestState> {
  try {
    const got = await fetchPublic(latestPath(app), true, APPS_BUCKET)
    if (got.kind === 'missing') return { status: 'empty' }
    const parsed = parseRelease(got.text)
    return parsed.ok ? { status: 'ok', release: parsed.release, text: got.text } : { status: 'invalid', error: parsed.error }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

/** The pointer reduced to what the pre-upload checks need. */
export const latestKnown = (s: LatestState | undefined): LatestKnown =>
  !s
    ? { status: 'unknown' }
    : s.status === 'ok'
      ? { status: 'ok', versionCode: s.release.versionCode, versionName: s.release.versionName }
      : s.status === 'empty'
        ? { status: 'empty' }
        : s.status === 'invalid'
          ? { status: 'invalid', error: s.error }
          : { status: 'unknown', error: s.error }

/** versionCode folders under `<app>/`, newest first. Needs the admins' SELECT policy. */
export async function listVersionFolders(app: AppId): Promise<number[]> {
  const { data, error } = await supabaseClient.storage
    .from(APPS_BUCKET)
    .list(app, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw error
  // Folders come back with id null; latest.json is a file and is skipped.
  return (data ?? [])
    .filter((o) => o.id === null && /^[1-9]\d{0,9}$/.test(o.name))
    .map((o) => Number(o.name))
    .sort((a, b) => b - a)
}

/**
 * Whether `<app>/<versionCode>/` holds anything. Asked two ways -- the bucket
 * listing and the public URLs (release.json plus any APK paths given) -- and
 * "exists" if either says so: refusing a free version is harmless, while a
 * released folder can never be overwritten.
 */
export async function versionFolderExists(app: AppId, versionCode: number, apkPaths: string[] = []): Promise<boolean> {
  let listError: unknown = null
  try {
    const { data, error } = await supabaseClient.storage.from(APPS_BUCKET).list(`${app}/${versionCode}`, { limit: 10 })
    if (error) throw error
    if ((data ?? []).length > 0) return true
  } catch (e) {
    listError = e
  }
  try {
    const sizes = await Promise.all([releasePath(app, versionCode), ...apkPaths].map((p) => headPublic(p, APPS_BUCKET)))
    if (sizes.some((s) => s !== null)) return true
  } catch (e) {
    if (listError) throw listError
    throw e
  }
  if (listError) throw listError
  return false
}

export interface VersionRow {
  versionCode: number
  release: AppRelease | null
  /** The exact bytes of release.json, as text (to compare with the pointer). */
  text?: string
  /** Why this folder is not a clean release, if it is not. */
  problem?: string
}

async function readVersion(app: AppId, versionCode: number): Promise<VersionRow> {
  try {
    // release.json is immutable and cached for a year, so no cache-bust.
    const got = await fetchPublic(releasePath(app, versionCode), false, APPS_BUCKET)
    if (got.kind === 'missing') return { versionCode, release: null, problem: 'incomplete: no release.json in this folder' }
    const parsed = parseRelease(got.text)
    if (!parsed.ok) return { versionCode, release: null, problem: `release.json is not valid: ${parsed.error}` }
    const r = parsed.release
    if (r.versionCode !== versionCode || r.app !== app)
      return { versionCode, release: r, text: got.text, problem: `release.json says ${r.app} ${r.versionCode}` }
    return { versionCode, release: r, text: got.text }
  } catch (e) {
    return { versionCode, release: null, problem: e instanceof Error ? e.message : String(e) }
  }
}

export interface AppState {
  latest: LatestState
  versions: VersionRow[]
  /** Listing the bucket failed (most often: not an admin, or no bucket yet). */
  listError: StorageErrorLike | null
}

export type AppReleasesState = Record<AppId, AppState>

async function loadApp(app: AppId): Promise<AppState> {
  const latestP = readLatest(app)
  let codes: number[] = []
  let listError: StorageErrorLike | null = null
  try {
    codes = await listVersionFolders(app)
  } catch (e) {
    listError = toErrorLike(e)
  }
  const versions = await Promise.all(codes.map((c) => readVersion(app, c)))
  return { latest: await latestP, versions, listError }
}

export async function loadAppReleasesState(): Promise<AppReleasesState> {
  const [phone, watch] = await Promise.all(APP_IDS.map(loadApp))
  return { phone, watch }
}

export function useAppReleasesState() {
  const [state, setState] = useState<AppReleasesState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Every state update happens in a promise callback, never synchronously in the
  // effect; a stale load (superseded by a newer one) is dropped.
  const seq = useRef({ n: 0 })
  const load = useCallback(() => {
    const mine = ++seq.current.n
    return loadAppReleasesState().then(
      (next) => {
        if (mine !== seq.current.n) return
        setState(next)
        setError(null)
        setLoading(false)
      },
      (e: unknown) => {
        if (mine !== seq.current.n) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
    )
  }, [])

  const reload = useCallback(() => {
    setLoading(true)
    return load()
  }, [load])

  useEffect(() => {
    const counter = seq.current
    void load()
    return () => {
      counter.n++
    }
  }, [load])

  return { state, loading, error, reload }
}

/** One write into the `apps` bucket, with exactly the options given. */
export const uploadAppObject = (path: string, bytes: ArrayBuffer, contentType: string, cacheControl: string, upsert: boolean) =>
  uploadObject(path, bytes, contentType, cacheControl, upsert, APPS_BUCKET)

/**
 * Tell open apps, right now, that a latest.json pointer moved: Realtime BROADCAST
 * on the public topic `app-releases`, event `release`, payload
 * { app, versionCode, versionName, at } (at = epoch ms, as for firmware). The
 * message carries no authority -- an app always re-reads latest.json -- so a lost or
 * spoofed message costs at most one extra check. Best effort: never throws.
 */
export const APP_RELEASE_TOPIC = 'app-releases'

export const announceAppRelease = (app: AppId, versionCode: number, versionName: string) =>
  broadcastOnce(APP_RELEASE_TOPIC, 'release', { app, versionCode, versionName, at: Date.now() })

export interface MakeCurrentPrecheck {
  /** The exact bytes of <app>/<vc>/release.json, to be copied over the pointer. */
  bytes: ArrayBuffer
  release: AppRelease
  /** Each APK as found through its public URL. */
  apks: { abi: string; path: string; size: number | null; expected: number }[]
  problems: string[]
}

/**
 * Everything that has to be true before latest.json may name a version: its
 * release.json is there, valid, names itself, and every APK it lists is reachable
 * at the size it claims ("bytes before pointer").
 */
export async function precheckMakeCurrent(app: AppId, versionCode: number): Promise<MakeCurrentPrecheck> {
  const path = releasePath(app, versionCode)
  const got = await fetchPublic(path, true, APPS_BUCKET)
  if (got.kind === 'missing') throw new Error(`${path} does not exist`)
  const parsed = parseRelease(got.text)
  if (!parsed.ok) throw new Error(`${path} is not a valid release: ${parsed.error}`)
  const release = parsed.release
  const problems: string[] = []
  if (release.app !== app) problems.push(`its release.json is for the ${release.app} app`)
  if (release.versionCode !== versionCode) problems.push(`its release.json says versionCode ${release.versionCode}`)
  const apks = await Promise.all(
    Object.entries(release.apks).map(async ([abi, e]) => {
      let size: number | null = null
      try {
        size = await headPublic(e.path, APPS_BUCKET)
        if (size === null) problems.push(`${abi}: ${basename(e.path)} is not in the bucket`)
        else if (Number.isFinite(size) && size !== e.size)
          problems.push(`${abi}: ${basename(e.path)} is ${size} bytes but release.json says ${e.size}`)
      } catch (err) {
        problems.push(`${abi}: could not reach ${e.path}: ${err instanceof Error ? err.message : String(err)}`)
      }
      return { abi, path: e.path, size, expected: e.size }
    })
  )
  return { bytes: got.bytes, release, apks, problems }
}

/** Reads latest.json back through the public URL and says whether it now names
 *  `versionCode` with exactly the bytes that were written. */
export async function verifyLatest(app: AppId, versionCode: number, bytes: ArrayBuffer) {
  const back = await readLatest(app)
  if (back.status !== 'ok') return { verified: false, readBack: back.status }
  const sameBytes = back.text === new TextDecoder().decode(bytes)
  return {
    verified: back.release.versionCode === versionCode && sameBytes,
    readBack: `${back.release.versionName} (${back.release.versionCode})${sameBytes ? '' : ', different bytes'}`,
  }
}

/** Copies a version's release.json bytes over `<app>/latest.json`, announces it,
 *  then reads the pointer back to prove the apps now see it. */
export async function makeCurrent(
  app: AppId,
  pre: MakeCurrentPrecheck
): Promise<UploadResult & { verified?: boolean; readBack?: string; announced?: Promise<boolean> }> {
  const res = await uploadAppObject(latestPath(app), pre.bytes, JSON_CONTENT_TYPE, POINTER_CACHE_CONTROL, true)
  if (!res.ok) return res
  const announced = announceAppRelease(app, pre.release.versionCode, pre.release.versionName)
  const v = await verifyLatest(app, pre.release.versionCode, pre.bytes)
  return { ok: true, ...v, announced }
}

import { useCallback, useEffect, useState } from 'react'

import { supabaseClient } from '@admin/lib/supabase'

export const formatBytes = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '—'
    : n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(2)} MB`
      : `${(n / 1024).toFixed(1)} KB`

export const formatWhen = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString()
}

export const formatDay = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return String(iso)
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 0) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 60) return `${d} days ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * Reads a whole table or view, newest first, paging around PostgREST's
 * max-rows (1000) the same way the generic table's export does.
 */
export function useAllRows(table: string, orderBy: string, cap = 10_000) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const out: Record<string, unknown>[] = []
      for (let offset = 0; offset < cap; offset += 1000) {
        const { data, error: err } = await supabaseClient
          .from(table)
          .select('*')
          .order(orderBy, { ascending: false, nullsFirst: false })
          .range(offset, offset + 999)
        if (err) throw new Error(err.message)
        const page = (data ?? []) as Record<string, unknown>[]
        out.push(...page)
        if (page.length < 1000) break
      }
      setRows(out)
      setError(null)
    } catch (e) {
      setRows(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [table, orderBy, cap])

  const reload = useCallback(() => {
    setLoading(true)
    return load()
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  return { rows, error, loading, reload }
}

import { useCallback, useEffect, useState } from 'react'

const MIN_COLUMN_WIDTH = 60
const MAX_COLUMN_WIDTH = 640

const clamp = (width: number) =>
  Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)))

/** Per-table column pixel widths from the resize handles, persisted per table. */
export function useColumnWidths(tableKey: string) {
  const storageKey = `proxima-admin:column-widths:${tableKey}`
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      const parsed = saved ? JSON.parse(saved) : null
      if (parsed && typeof parsed === 'object') {
        const sanitized: Record<string, number> = {}
        for (const [col, width] of Object.entries(parsed)) {
          if (typeof width === 'number' && Number.isFinite(width)) sanitized[col] = clamp(width)
        }
        setColumnWidths(sanitized)
        return
      }
    } catch {
      // Corrupt or unreadable storage just means "no saved widths".
    }
    setColumnWidths({})
  }, [storageKey])

  const setColumnWidth = useCallback(
    (column: string, width: number) => {
      setColumnWidths((prev) => {
        const next = { ...prev, [column]: clamp(width) }
        try {
          localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {
          // Non-fatal.
        }
        return next
      })
    },
    [storageKey]
  )

  const resetColumnWidths = useCallback(() => {
    setColumnWidths({})
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Non-fatal.
    }
  }, [storageKey])

  return { columnWidths, setColumnWidth, resetColumnWidths }
}

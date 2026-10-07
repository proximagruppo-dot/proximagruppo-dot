import { useCallback, useEffect, useState } from 'react'

/** Which columns are shown, per table, persisted. The id column is never
 *  hideable, so it is forced back in on read as well as on toggle. */
export function useVisibleColumns(tableKey: string, allColumns: string[], idField: string) {
  const storageKey = `proxima-admin:visible-columns:${tableKey}`
  const [hidden, setHidden] = useState<string[]>([])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      const parsed = saved ? JSON.parse(saved) : null
      setHidden(Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string' && c !== idField) : [])
    } catch {
      setHidden([])
    }
  }, [storageKey, idField])

  const persist = useCallback(
    (next: string[]) => {
      setHidden(next)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Non-fatal.
      }
    },
    [storageKey]
  )

  const toggleColumn = useCallback(
    (column: string, visible: boolean) => {
      if (column === idField) return
      persist(visible ? hidden.filter((c) => c !== column) : [...new Set([...hidden, column])])
    },
    [hidden, idField, persist]
  )

  const showAllColumns = useCallback(() => persist([]), [persist])

  const visibleColumns = allColumns.filter((c) => !hidden.includes(c))

  return { visibleColumns, hiddenCount: hidden.length, toggleColumn, showAllColumns }
}

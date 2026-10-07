import { useCallback, useEffect, useState } from 'react'

export type TableDensity = 'default' | 'middle' | 'small'

const STORAGE_KEY = 'proxima-admin:table-density'
const EVENT_NAME = 'proxima-admin:table-density-change'

const read = (): TableDensity => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'default' || saved === 'middle' || saved === 'small') return saved
  } catch {
    // Private windows and blocked site data both throw here; the default is fine.
  }
  return 'default'
}

/** Row density, shared across every mounted table. The custom event keeps tables
 *  in the same tab in sync; the `storage` event covers other tabs. */
export function useTableDensity() {
  const [density, setDensityState] = useState<TableDensity>(read)

  useEffect(() => {
    const onLocal = (event: Event) => setDensityState((event as CustomEvent<TableDensity>).detail)
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setDensityState(read())
    }
    window.addEventListener(EVENT_NAME, onLocal)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(EVENT_NAME, onLocal)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const setDensity = useCallback((next: TableDensity) => {
    setDensityState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Non-fatal: density just won't survive a reload.
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }))
  }, [])

  return { density, setDensity }
}

/** Row paddings per density, applied to every body cell. */
export const DENSITY_CELL_CLASS: Record<TableDensity, string> = {
  default: 'py-3',
  middle: 'py-2',
  small: 'py-1',
}

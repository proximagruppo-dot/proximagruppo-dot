import { useEffect, useState } from 'react'

import { supabaseClient } from '@admin/lib/supabase'

/** Resolved labels live module-wide so paging back and forth, or two tables
 *  pointing at the same resource, never refetch an id that is already known. */
const cache = new Map<string, string>()
const cacheKey = (resource: string, id: unknown) => `${resource}:${String(id)}`

/** Looks up the display label for every foreign key on the current page in ONE
 *  request per relation (`in(id, [...])`), rather than one request per cell.
 *  A page of 100 rows pointing at 3 users costs 1 request, not 100. */
export function useRelationLabels(
  targetResource: string | undefined,
  labelField: string | undefined,
  idField: string,
  ids: unknown[]
) {
  const [, forceRender] = useState(0)

  // Stable dependency: the sorted set of ids actually present on this page.
  const missing = targetResource
    ? [...new Set(ids.filter((id) => id !== null && id !== undefined))]
        .filter((id) => !cache.has(cacheKey(targetResource, id)))
        .sort()
    : []
  const missingKey = missing.join(',')

  useEffect(() => {
    if (!targetResource || !labelField || missing.length === 0) return
    let cancelled = false

    supabaseClient
      .from(targetResource)
      .select(`${idField},${labelField}`)
      .in(idField, missing)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        for (const row of data as unknown as Record<string, unknown>[]) {
          const label = row[labelField]
          if (label !== null && label !== undefined) {
            cache.set(cacheKey(targetResource, row[idField]), String(label))
          }
        }
        forceRender((n) => n + 1)
      })

    return () => {
      cancelled = true
    }
    // `missingKey` is the content hash of `missing`; depending on the array
    // itself would refetch on every render since it is rebuilt each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetResource, labelField, idField, missingKey])

  return (id: unknown): string | undefined =>
    targetResource ? cache.get(cacheKey(targetResource, id)) : undefined
}

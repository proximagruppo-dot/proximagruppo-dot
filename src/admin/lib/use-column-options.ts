import { useEffect, useState } from 'react'

import { supabaseClient } from '@admin/lib/supabase'

/** Safety stop. The filterable columns are all low-cardinality (lamp name, MAC,
 *  version, level), so this is never reached in practice -- it only bounds the
 *  request count if a column turns out to hold far more values than expected. */
const MAX_DISTINCT = 300

/** Distinct values for a column, for the header filter dropdowns. Columns whose
 *  domain is known up front (level, tag) pass `fixedOptions` and never query.
 *
 *  PostgREST has no SELECT DISTINCT, and it caps every response at `max-rows`
 *  (1000 on this project) -- silently, with no error. Sampling the first 1000
 *  rows therefore missed real values: lamp_log's 14,870 rows are physically
 *  ordered by lamp, so a 1000-row sample saw ONE of the two lamps and the other
 *  (376 rows) could never be filtered on.
 *
 *  So this walks the distinct values instead, the usual emulation of a loose
 *  index scan: ask for the smallest value above the last one found, one row at a
 *  time. That is one round trip per distinct value rather than per 1000 rows --
 *  for a low-cardinality column it is both cheaper than sampling and complete. */
export function useColumnOptions(resource: string, field: string, fixedOptions?: string[]) {
  const [options, setOptions] = useState<string[]>(fixedOptions ?? [])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (fixedOptions) {
      setOptions(fixedOptions)
      return
    }

    let cancelled = false
    setLoading(true)

    const collect = async () => {
      const found: string[] = []
      let after: string | null = null

      while (found.length < MAX_DISTINCT) {
        let query = supabaseClient.from(resource).select(field).order(field, { ascending: true }).limit(1)
        if (after !== null) query = query.gt(field, after)

        const { data, error } = await query
        if (error) throw new Error(error.message)

        const row = (data as unknown as Record<string, unknown>[] | null)?.[0]
        // `null` sorts last in Postgres, so reaching it means the column is
        // exhausted -- there is no value above it to ask for.
        if (!row || row[field] === null || row[field] === undefined) break

        const value = String(row[field])
        found.push(value)
        after = value
      }

      return found.filter((v) => v !== '')
    }

    collect()
      .then((values) => {
        if (cancelled) return
        setOptions(values)
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // fixedOptions is a literal from the resource config, stable per column
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, field])

  return { options, loading }
}

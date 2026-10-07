import { Skeleton } from '@admin/components/ui/skeleton'

/** Placeholder rows while the list request is in flight, so the table never
 *  blank-flashes from nothing straight to data. One cell per real column, so
 *  the skeleton has the same shape as what replaces it. */
export function DataTableSkeleton({ columns, rows = 10 }: { columns: number; rows?: number }) {
  return (
    <div className="px-6 py-4">
      <div className="mb-3 flex gap-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className="h-8 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

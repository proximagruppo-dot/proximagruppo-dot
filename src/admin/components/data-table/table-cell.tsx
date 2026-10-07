import { FkPreviewPopover } from '@admin/components/data-table/fk-preview-popover'
import { LevelBadge, StatusBadge } from '@admin/components/data-table/status-badge'
import { formatDateTime, formatNumber, isDateLikeColumn } from '@admin/lib/formatters'
import type { ResourceColumn, ResourceRelation } from '@admin/config/resources'

/** Value-type -> rendering rules, in priority order. Mirrors the reference
 *  backoffice's TableCell: a relation wins over everything, then booleans,
 *  then status-ish columns, then numbers, then dates, then long text. */
export function DataTableCell({
  value,
  column,
  relation,
  relationLabel,
  showRelations,
}: {
  value: unknown
  column: ResourceColumn
  relation?: ResourceRelation
  relationLabel?: string
  showRelations: boolean
}) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">-</span>
  }

  if (showRelations && relation) {
    return (
      <FkPreviewPopover
        targetResource={relation.targetResource}
        targetIdField={relation.targetIdField}
        recordId={value as string | number}
      >
        <span className="inline-flex items-center gap-1.5">
          <span>{String(value)}</span>
          {relationLabel && <span className="text-muted-foreground">({relationLabel})</span>}
        </span>
      </FkPreviewPopover>
    )
  }

  if (typeof value === 'boolean') return <span>{value ? '✅' : '❌'}</span>

  if (column.key === 'level') return <LevelBadge level={String(value)} />
  if (column.key === 'status' || column.key.toLowerCase().includes('status')) {
    return <StatusBadge status={String(value)} />
  }

  if (typeof value === 'number') {
    return <span className="tabular-nums">{formatNumber(value)}</span>
  }

  if (typeof value === 'string') {
    if (isDateLikeColumn(column.key)) {
      return <span className="whitespace-nowrap">{formatDateTime(value)}</span>
    }
    if (value.length > 100) {
      return (
        <span className="block max-w-[300px] truncate" title={value}>
          {value}
        </span>
      )
    }
    return <span>{value}</span>
  }

  if (Array.isArray(value) || typeof value === 'object') {
    let json: string
    try {
      json = JSON.stringify(value)
    } catch {
      return <span>{String(value)}</span>
    }
    return (
      <span className="truncate font-mono text-xs text-muted-foreground" title={json}>
        {json.length > 50 ? `${json.slice(0, 50)}...` : json}
      </span>
    )
  }

  return <span>{String(value)}</span>
}

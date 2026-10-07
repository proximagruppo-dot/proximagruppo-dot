import { cn } from '@admin/lib/utils'

/** Semantic colouring by pattern match rather than a per-table mapping, so a
 *  new status value is coloured sensibly without touching this file. */
const STATUS_PATTERNS = {
  success: ['active', 'approved', 'completed', 'success', 'confirmed', 'verified', 'enabled', 'done', 'ok', 'online'],
  warning: ['pending', 'in_progress', 'waiting', 'processing', 'draft', 'scheduled', 'partial', 'warn'],
  error: ['rejected', 'inactive', 'failed', 'cancelled', 'canceled', 'deleted', 'disabled', 'blocked', 'expired', 'error', 'offline'],
}

function getStatusVariant(status: string): 'success' | 'warning' | 'error' | 'default' {
  const normalized = status.toLowerCase().trim()
  if (STATUS_PATTERNS.success.some((p) => normalized.includes(p))) return 'success'
  if (STATUS_PATTERNS.warning.some((p) => normalized.includes(p))) return 'warning'
  if (STATUS_PATTERNS.error.some((p) => normalized.includes(p))) return 'error'
  return 'default'
}

const VARIANT_CLASSES: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  error: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  default: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">-</span>
  const text = String(status)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[getStatusVariant(text)]
      )}
    >
      {text}
    </span>
  )
}

/** PROXIMA's lamp_log `level` column is a single letter (I | W | E) straight out
 *  of 001_schema.sql, which no generic pattern can colour -- so it maps here. */
const LEVEL_LABELS: Record<string, { label: string; variant: keyof typeof VARIANT_CLASSES }> = {
  I: { label: 'INFO', variant: 'default' },
  W: { label: 'WARN', variant: 'warning' },
  E: { label: 'ERROR', variant: 'error' },
}

export function LevelBadge({ level }: { level: string | null | undefined }) {
  if (!level) return <span className="text-muted-foreground">-</span>
  const entry = LEVEL_LABELS[String(level).toUpperCase()]
  if (!entry) return <StatusBadge status={String(level)} />
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[entry.variant]
      )}
    >
      {entry.label}
    </span>
  )
}

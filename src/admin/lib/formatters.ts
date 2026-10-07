/** Shared value/label formatting for the backoffice tables, matching the
 *  reference backoffice (p2cam-backoffice-v2 src/lib/formatters.ts). */

export const formatColumnTitle = (column: string): string => {
  if (!column) return ''
  return column
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-US')
}

export const formatNumber = (value: number | null | undefined): string =>
  value === null || value === undefined ? '-' : value.toLocaleString('en-US')

export const safeToString = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const isDateLikeColumn = (field: string): boolean => /(^date$|date|_at)$/i.test(field)

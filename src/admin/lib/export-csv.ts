/** Escapes one cell for CSV: quotes wrap anything containing a delimiter,
 *  quote or newline, and inner quotes are doubled. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function exportRowsToCsv(
  filename: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[]
) {
  const header = columns.map((c) => cell(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => cell(row[c.key])).join(',')).join('\n')
  // The BOM is what makes Excel read this as UTF-8 instead of mangling
  // non-ASCII (lamp notes and user names are not guaranteed to be ASCII).
  const blob = new Blob([`﻿${header}\n${body}`], { type: 'text/csv;charset=utf-8;' })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

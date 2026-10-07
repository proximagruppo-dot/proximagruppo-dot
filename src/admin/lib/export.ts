import { safeToString } from '@admin/lib/formatters'

export type ExportFormat = 'csv' | 'json' | 'print'
/** Which rows an export covers: what is on screen, everything matching the
 *  current filters, or just the checked rows. */
export type ExportMode = 'visible' | 'all' | 'selected'

export interface ExportColumn {
  key: string
  label: string
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Escapes one CSV cell: quotes wrap anything containing a delimiter, quote or
 *  newline, and inner quotes are doubled. */
function csvCell(value: unknown): string {
  const s = safeToString(value)
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function exportCsv(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]) {
  const header = columns.map((c) => csvCell(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(',')).join('\n')
  // The BOM is what makes Excel read this as UTF-8 instead of mangling
  // non-ASCII (lamp notes and user names are not guaranteed to be ASCII).
  download(filename, new Blob([`﻿${header}\n${body}`], { type: 'text/csv;charset=utf-8;' }))
}

export function exportJson(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  pretty: boolean
) {
  const projected = rows.map((row) => Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? null])))
  const json = JSON.stringify(projected, null, pretty ? 2 : 0)
  download(filename, new Blob([json], { type: 'application/json;charset=utf-8;' }))
}

/** Opens a print-ready table in a new window. Written into a blank document
 *  rather than printing the app itself, so the sidebar, toolbar and sticky
 *  header don't end up on the page. */
export function printRows(title: string, columns: ExportColumn[], rows: Record<string, unknown>[]) {
  const escape = (value: unknown) =>
    safeToString(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')

  const head = columns.map((c) => `<th>${escape(c.label)}</th>`).join('')
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${escape(row[c.key])}</td>`).join('')}</tr>`)
    .join('')

  const win = window.open('', '_blank')
  if (!win) {
    window.alert('Could not open the print view. Allow pop-ups for this site and try again.')
    return
  }
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>
      body{font:12px -apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#111}
      h1{font-size:16px;margin:0 0 4px}
      p{color:#666;margin:0 0 16px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#f4f4f5}
      tr{break-inside:avoid}
     </style></head><body>
     <h1>${escape(title)}</h1>
     <p>${rows.length.toLocaleString()} rows · ${new Date().toLocaleString()}</p>
     <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
     </body></html>`
  )
  win.document.close()
  win.focus()
  win.print()
}

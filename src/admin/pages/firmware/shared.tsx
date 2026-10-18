import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy, Loader2, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { ToneBadge, type BadgeTone } from '@admin/components/data-table/status-badge'
import { Button } from '@admin/components/ui/button'
import { explainStorageError, type Channel } from '@admin/lib/firmware'
import type { StorageErrorLike } from '@admin/lib/firmware-storage'
import { cn } from '@admin/lib/utils'

export function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <ToneBadge tone={channel === 'stable' ? 'success' : 'warning'} className="uppercase tracking-wide">
      {channel}
    </ToneBadge>
  )
}

/** A hash shortened to 12 characters, the full value in the tooltip and one
 *  click away on the clipboard. */
export function CopyHash({ value, chars = 12 }: { value: string | null | undefined; chars?: number }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1">
      <code className="font-mono text-xs" title={value}>
        {value.slice(0, chars)}…
      </code>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Copy full hash"
        title="Copy full hash"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          })
        }}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </Button>
    </span>
  )
}

export function CheckIcon({ status }: { status: 'pass' | 'fail' | 'pending' | 'running' | 'skipped' }) {
  if (status === 'pass') return <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
  if (status === 'fail') return <XCircle className="size-4 shrink-0 text-destructive" />
  if (status === 'running') return <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
  return <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
}

/** A Storage/RLS error: the raw message verbatim, then what it means. */
export function StorageErrorBox({ error, className }: { error: StorageErrorLike; className?: string }) {
  return (
    <div className={cn('rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm', className)}>
      <p className="font-mono text-xs break-words text-destructive">
        {error.message}
        {error.status ? ` (HTTP ${error.status}${error.statusCode && error.statusCode !== String(error.status) ? `, code ${error.statusCode}` : ''})` : error.statusCode ? ` (code ${error.statusCode})` : ''}
      </p>
      <p className="mt-1.5 text-muted-foreground">{explainStorageError(error)}</p>
    </div>
  )
}

export function Notice({
  tone = 'default',
  title,
  children,
  className,
}: {
  tone?: 'default' | 'warning' | 'error'
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-lg border p-3 text-sm',
        tone === 'warning' && 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
        tone === 'error' && 'border-destructive/40 bg-destructive/5',
        tone === 'default' && 'bg-muted/40',
        className
      )}
    >
      {tone !== 'default' && <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', tone === 'error' && 'text-destructive')} />}
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className={cn(title && 'mt-0.5', tone === 'default' && 'text-muted-foreground')}>{children}</div>
      </div>
    </div>
  )
}


const RESULT_TONE: Record<string, BadgeTone> = {
  ok: 'success',
  cancelled: 'default',
  rolled_back: 'warning',
  download_failed: 'error',
  transfer_failed: 'error',
  reconnect_failed: 'error',
}

const RESULT_HINT: Record<string, string> = {
  ok: 'Installed and kept by the lamp.',
  download_failed: 'The phone could not download or verify the image; the lamp was not touched.',
  transfer_failed: 'The Bluetooth transfer failed; the old firmware is still running.',
  rolled_back: 'The lamp booted the new firmware, failed probation and went back to the old one.',
  cancelled: 'Stopped before completion (by the user or the lamp); the old firmware is still running.',
  reconnect_failed: 'The phone could not reconnect after the reboot, so the outcome was not confirmed.',
}

/** firmware_install.result, coloured by what it means for the lamp. */
export function InstallResultBadge({ result }: { result: string | null | undefined }) {
  if (!result) return <span className="text-muted-foreground">—</span>
  return (
    <ToneBadge tone={RESULT_TONE[result] ?? 'default'} title={RESULT_HINT[result]}>
      {result.replace(/_/g, ' ')}
    </ToneBadge>
  )
}

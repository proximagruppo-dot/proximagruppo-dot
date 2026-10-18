import { Check, Link2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@admin/components/ui/button'
import { basename, explainAppStorageError, type ApkEntry } from '@admin/lib/app-releases'
import type { StorageErrorLike } from '@admin/lib/firmware-storage'
import { formatBytes } from '@admin/pages/firmware/helpers'
import { CopyHash, StorageErrorBox } from '@admin/pages/firmware/shared'

/** StorageErrorBox, explained in terms of the `apps` bucket and its policies. */
export function AppStorageErrorBox({ error, className }: { error: StorageErrorLike; className?: string }) {
  return <StorageErrorBox error={error} className={className} explain={explainAppStorageError} />
}

/** "Copy link" for an APK's public URL: what a tester opens for the first install. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="xs"
      className="gap-1 text-muted-foreground"
      title={url}
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied ? <Check className="size-3" /> : <Link2 className="size-3" />}
      {copied ? 'Copied' : 'Link'}
    </Button>
  )
}

/** The APKs of one release: ABI, file, size, short sha256 with copy, link. */
export function ApkList({ apks }: { apks: Record<string, ApkEntry> }) {
  return (
    <ul className="divide-y rounded-lg border">
      {Object.entries(apks).map(([abi, a]) => (
        <li key={abi} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium" title={a.path}>
            {abi} <span className="font-normal text-muted-foreground">{basename(a.path)}</span>
          </span>
          <span className="tabular-nums text-xs" title={`${a.size.toLocaleString('en-US')} bytes`}>
            {formatBytes(a.size)}
          </span>
          <CopyHash value={a.sha256} chars={10} />
          <CopyLink url={a.url} />
        </li>
      ))}
    </ul>
  )
}

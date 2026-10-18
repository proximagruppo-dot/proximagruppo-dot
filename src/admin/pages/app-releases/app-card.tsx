import { AlertTriangle, ArrowDownToLine, ArrowUpToLine, Smartphone, Upload, Watch } from 'lucide-react'

import { ToneBadge } from '@admin/components/data-table/status-badge'
import { Button } from '@admin/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@admin/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@admin/components/ui/table'
import { APP_LABEL, APP_PACKAGE, latestPath, type AppId } from '@admin/lib/app-releases'
import type { AppState } from '@admin/lib/app-release-storage'
import { formatBytes, formatDay, formatWhen } from '@admin/pages/firmware/helpers'
import { Notice } from '@admin/pages/firmware/shared'
import { ApkList, AppStorageErrorBox } from '@admin/pages/app-releases/shared'

export interface MakeCurrentTarget {
  app: AppId
  versionCode: number
  versionName: string
}

const APP_ICON = { phone: Smartphone, watch: Watch } as const

/** One app: what latest.json serves today, and every version folder in the bucket
 *  with "Make current" / "Roll back to …" (both copy release.json over latest.json). */
export function AppCard({
  app,
  state,
  onMakeCurrent,
  onPublish,
}: {
  app: AppId
  state: AppState
  onMakeCurrent: (t: MakeCurrentTarget) => void
  onPublish: (app: AppId) => void
}) {
  const { latest, versions, listError } = state
  const current = latest.status === 'ok' ? latest.release : null
  const Icon = APP_ICON[app]

  // The pointer is a byte copy of one release.json; if it no longer matches that
  // version's record, it was written some other way.
  const record = current ? versions.find((v) => v.versionCode === current.versionCode) : undefined
  const drifted = latest.status === 'ok' && record?.text !== undefined && record.text !== latest.text

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <ToneBadge tone="default" className="gap-1.5 uppercase tracking-wide">
              <Icon className="size-3" />
              {APP_LABEL[app]}
            </ToneBadge>
            {current ? (
              <span className="font-mono text-2xl font-semibold tracking-tight">{current.versionName}</span>
            ) : (
              <span className="text-2xl font-semibold tracking-tight text-muted-foreground">
                {latest.status === 'empty' ? 'none yet' : '?'}
              </span>
            )}
            {current && (
              <span className="font-mono text-sm font-normal text-muted-foreground">versionCode {current.versionCode}</span>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => onPublish(app)}>
            <Upload className="size-3.5" /> Publish {app} build
          </Button>
        </div>
        <CardDescription className="font-mono text-xs">
          {latestPath(app)} · {APP_PACKAGE[app]}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {latest.status === 'empty' && (
          <p className="text-sm text-muted-foreground">
            No latest.json yet (404). The {app} app offers testers nothing until a version is made current.
          </p>
        )}
        {latest.status === 'invalid' && (
          <Notice tone="error" title="latest.json is not a valid release">
            {latest.error}
          </Notice>
        )}
        {latest.status === 'error' && (
          <Notice tone="error" title="Could not read latest.json">
            {latest.error}
          </Notice>
        )}

        {current && (
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Released</dt>
            <dd>{formatWhen(current.released)}</dd>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="text-muted-foreground">{current.notes || '—'}</dd>
            <dt className="text-muted-foreground">APKs</dt>
            <dd className="min-w-0">
              <ApkList apks={current.apks} />
            </dd>
          </dl>
        )}

        {drifted && (
          <Notice tone="warning" title="latest.json differs from the release record">
            {latestPath(app)} names versionCode {current?.versionCode}, but its bytes are not those of{' '}
            {app}/{current?.versionCode}/release.json. Make {current?.versionName} current again to repair it.
          </Notice>
        )}

        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-medium">Published versions</h3>
          {listError && (
            <div className="flex flex-col gap-2">
              <AppStorageErrorBox error={listError} />
              <p className="text-xs text-muted-foreground">
                Listing needs the admins’ SELECT policy from 009_app_releases.sql. latest.json above is read through the
                public URL and does not need it.
              </p>
            </div>
          )}
          {!listError && versions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {current
                ? `The bucket listing came back empty, yet latest.json is served. Storage returns an empty list to accounts that are not admins.`
                : `No ${app} versions in the bucket yet.`}
            </p>
          )}
          {versions.length > 0 && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>APKs</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right" title="Copy this version's release.json over latest.json">
                      Current
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => {
                    const r = v.release
                    const isCurrent = current?.versionCode === v.versionCode
                    const lower = current !== null && v.versionCode < current.versionCode
                    const total = r ? Object.values(r.apks).reduce((n, a) => n + a.size, 0) : null
                    return (
                      <TableRow key={v.versionCode}>
                        <TableCell className="align-top">
                          <div className="font-mono text-sm font-medium">{r?.versionName ?? '—'}</div>
                          <div className="text-xs text-muted-foreground" title={formatWhen(r?.released)}>
                            <span className="font-mono">{v.versionCode}</span> · {formatDay(r?.released)}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-xs" title={r ? Object.keys(r.apks).join(', ') : undefined}>
                          {r ? (
                            <>
                              <div>
                                {Object.keys(r.apks).length} APK{Object.keys(r.apks).length === 1 ? '' : 's'}
                              </div>
                              <div className="tabular-nums text-muted-foreground">{formatBytes(total)}</div>
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="w-full min-w-28 align-top whitespace-normal text-sm">
                          {v.problem && (
                            <p className="mb-1 flex items-start gap-1.5 text-destructive">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {v.problem}
                            </p>
                          )}
                          {r?.notes || (v.problem ? null : <span className="text-muted-foreground">—</span>)}
                        </TableCell>
                        <TableCell className="align-top text-right whitespace-nowrap">
                          {isCurrent ? (
                            <ToneBadge tone="success">current</ToneBadge>
                          ) : (
                            <Button
                              variant={lower ? 'outline' : 'default'}
                              size="xs"
                              className="gap-1"
                              disabled={!r || !!v.problem}
                              onClick={() =>
                                r && onMakeCurrent({ app, versionCode: v.versionCode, versionName: r.versionName })
                              }
                            >
                              {lower ? <ArrowDownToLine className="size-3" /> : <ArrowUpToLine className="size-3" />}
                              {lower ? `Roll back to ${r?.versionName ?? v.versionCode}` : 'Make current'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

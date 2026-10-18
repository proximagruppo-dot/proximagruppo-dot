import { HelpCircle, Loader2, RotateCcw, Upload } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@admin/components/ui/badge'
import { Button } from '@admin/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@admin/components/ui/card'
import { DataTableSkeleton } from '@admin/components/data-table/data-table-skeleton'
import { APPS_BUCKET, APP_IDS, type AppId } from '@admin/lib/app-releases'
import { useAppReleasesState } from '@admin/lib/app-release-storage'
import { useIsAdmin } from '@admin/lib/firmware-storage'
import { Notice } from '@admin/pages/firmware/shared'
import { AppCard, type MakeCurrentTarget } from '@admin/pages/app-releases/app-card'
import { MakeCurrentDialog } from '@admin/pages/app-releases/make-current-dialog'
import { AppPublishSheet } from '@admin/pages/app-releases/publish-sheet'

/**
 * Phone and watch app builds for testers, without a store: the `apps` Storage
 * bucket (009_app_releases.sql). Each app has a latest.json pointer the app reads,
 * and immutable versionCode folders with release.json and the APKs. Same rules as
 * the Firmware page; see lib/app-releases.ts.
 */
export function AppReleasesPage() {
  const apps = useAppReleasesState()
  const isAdmin = useIsAdmin()
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishApp, setPublishApp] = useState<AppId | null>(null)
  const [target, setTarget] = useState<MakeCurrentTarget | null>(null)

  const openPublish = (app: AppId | null) => {
    setPublishApp(app)
    setPublishOpen(true)
  }

  const summary = apps.state
    ? APP_IDS.map((a) => {
        const l = apps.state![a].latest
        return `${a} ${l.status === 'ok' ? `${l.release.versionName} (${l.release.versionCode})` : l.status === 'empty' ? 'none' : '?'}`
      }).join(' · ')
    : 'loading…'

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b px-6 pb-3 pt-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">App releases</h1>
          <p className="text-sm text-muted-foreground">Phone and watch builds for testers, without a store — {summary}.</p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          storage/{APPS_BUCKET}
        </Badge>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <p className="text-sm text-muted-foreground">
          A tester’s app installs a build only when its versionCode is higher than the one it runs.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void apps.reload()} disabled={apps.loading}>
            {apps.loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openPublish(null)}>
            <Upload className="size-3.5" />
            Publish build
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isAdmin === false && (
          <Notice tone="warning" title="This account is not an admin" className="mx-6 mt-6">
            public.is_admin() is false for you, so Supabase will refuse every upload and every move of latest.json, and the
            bucket listing comes back empty. Ask for a row in public.admins.
          </Notice>
        )}
        {apps.error && <div className="p-6 text-sm text-destructive">Could not load app releases: {apps.error}</div>}

        {apps.loading && !apps.state ? (
          <DataTableSkeleton columns={2} rows={4} />
        ) : (
          apps.state && (
            <div className="flex flex-col gap-4 p-6">
              <div className="grid gap-4 xl:grid-cols-2">
                {APP_IDS.map((a) => (
                  <AppCard key={a} app={a} state={apps.state![a]} onMakeCurrent={setTarget} onPublish={openPublish} />
                ))}
              </div>
              <HowTestersUpdate />
            </div>
          )
        )}
      </div>

      <AppPublishSheet
        open={publishOpen}
        onOpenChange={setPublishOpen}
        app={publishApp}
        isAdmin={isAdmin}
        onPublished={() => void apps.reload()}
      />

      {target && (
        <MakeCurrentDialog
          key={`${target.app}:${target.versionCode}`}
          target={target}
          latest={apps.state?.[target.app].latest}
          onClose={() => setTarget(null)}
          onDone={() => void apps.reload()}
        />
      )}
    </div>
  )
}

function HowTestersUpdate() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HelpCircle className="size-4" /> How testers update
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>
            <strong className="text-foreground">First install by hand, once.</strong> Send the tester the APK link from the
            card above (the <span className="font-mono">arm64-v8a</span> one for a phone), open it on the device and
            install it. A watch has no browser: install <span className="font-mono">app.apk</span> with adb.
          </li>
          <li>
            <strong className="text-foreground">Android asks once</strong> to allow PROXIMA to install apps (“Install
            unknown apps”). The tester turns it on for PROXIMA; it is not asked again.
          </li>
          <li>
            <strong className="text-foreground">Afterwards updates arrive in the app.</strong> When latest.json names a
            higher versionCode, the app offers the update (open apps at once, through the broadcast), downloads it and hands
            it to Android, which shows its install screen for the tester to confirm.
          </li>
        </ol>
        <p>
          Every build must be signed with the same key as the one installed; otherwise Android refuses it as an update and the
          old app has to be uninstalled first.
        </p>
      </CardContent>
    </Card>
  )
}

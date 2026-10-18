import { Loader2, RotateCcw, Upload } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Navigate, useParams } from 'react-router-dom'

import { Badge } from '@admin/components/ui/badge'
import { Button } from '@admin/components/ui/button'
import { CHANNELS, FIRMWARE_BUCKET } from '@admin/lib/firmware'
import { useFirmwareState, useIsAdmin } from '@admin/lib/firmware-storage'
import { cn } from '@admin/lib/utils'
import { Notice } from '@admin/pages/firmware/shared'
import { ChannelMoveDialog, type MoveTarget } from '@admin/pages/firmware/channel-move-dialog'
import { ChannelsTab } from '@admin/pages/firmware/channels-tab'
import { FleetTab } from '@admin/pages/firmware/fleet-tab'
import { useAllRows } from '@admin/pages/firmware/helpers'
import { InstallsTab } from '@admin/pages/firmware/installs-tab'
import { PublishSheet } from '@admin/pages/firmware/publish-sheet'
import { ReleasesTab } from '@admin/pages/firmware/releases-tab'

const TABS = [
  { id: 'releases', label: 'Releases' },
  { id: 'channels', label: 'Channels' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'installs', label: 'Install reports' },
] as const
type TabId = (typeof TABS)[number]['id']

/**
 * Lamp firmware: the `firmware` Storage bucket (releases and the beta/stable
 * channel pointers), the fleet as last seen by the app, and install reports.
 * A custom page rather than a generic table: the bucket is not a table, and
 * every write here follows Ali's release rules (see lib/firmware.ts).
 */
export function FirmwarePage() {
  const { tab } = useParams<{ tab?: string }>()
  const active = TABS.find((t) => t.id === tab)?.id as TabId | undefined

  const fw = useFirmwareState()
  const isAdmin = useIsAdmin()
  const fleet = useAllRows('firmware_fleet', 'last_seen_at')
  const installs = useAllRows('firmware_install', 'created_at')
  const [publishOpen, setPublishOpen] = useState(false)
  const [move, setMove] = useState<MoveTarget | null>(null)

  if (!active) return <Navigate to="/firmware/releases" replace />

  const refreshing = fw.loading || fleet.loading || installs.loading
  const refreshAll = () => {
    void fw.reload()
    void fleet.reload()
    void installs.reload()
  }

  const channelSummary = fw.state
    ? CHANNELS.map((c) => {
        const p = fw.state!.pointers[c]
        return `${c} ${p.status === 'ok' ? p.manifest.version : p.status === 'empty' ? 'empty' : '?'}`
      }).join(' · ')
    : 'loading…'

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b px-6 pb-3 pt-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Firmware</h1>
          <p className="text-sm text-muted-foreground">
            Lamp firmware releases, channels and fleet — {channelSummary}.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          storage/{FIRMWARE_BUCKET}
        </Badge>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <nav className="flex items-center gap-1 rounded-lg border p-0.5">
          {TABS.map((t) => (
            <NavLink
              key={t.id}
              to={`/firmware/${t.id}`}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refreshAll} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setPublishOpen(true)}>
            <Upload className="size-3.5" />
            Publish release
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isAdmin === false && (
          <Notice tone="warning" title="This account is not an admin" className="mx-6 mt-6">
            public.is_admin() is false for you, so Supabase will refuse every upload and channel move, and the bucket
            listing comes back empty. Ask for a row in public.admins.
          </Notice>
        )}
        {fw.error && <div className="p-6 text-sm text-destructive">Could not load firmware: {fw.error}</div>}
        {active === 'releases' && (
          <ReleasesTab state={fw.state} loading={fw.loading} onMove={setMove} onPublish={() => setPublishOpen(true)} />
        )}
        {active === 'channels' && <ChannelsTab state={fw.state} loading={fw.loading} onMove={setMove} />}
        {active === 'fleet' && (
          <FleetTab rows={fleet.rows} error={fleet.error} loading={fleet.loading} state={fw.state} />
        )}
        {active === 'installs' && <InstallsTab rows={installs.rows} error={installs.error} loading={installs.loading} />}
      </div>

      <PublishSheet
        open={publishOpen}
        onOpenChange={setPublishOpen}
        state={fw.state}
        isAdmin={isAdmin}
        onPublished={() => void fw.reload()}
      />

      {move && (
        <ChannelMoveDialog
          key={`${move.channel}:${move.version}`}
          target={move}
          pointer={fw.state?.pointers[move.channel]}
          onClose={() => setMove(null)}
          onDone={() => void fw.reload()}
        />
      )}
    </div>
  )
}

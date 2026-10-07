import { useShow } from '@refinedev/core'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'

import { Button } from '@admin/components/ui/button'
import { getResource } from '@admin/config/resources'

export function DataShow() {
  const { resource: resourceName, id } = useParams<{ resource: string; id: string }>()
  const navigate = useNavigate()
  const resource = getResource(resourceName ?? '')

  const { result, query } = useShow({ resource: resourceName, id })

  if (!resource) return <div className="p-6 text-sm text-muted-foreground">Unknown resource.</div>

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-1.5" onClick={() => navigate(`/${resource.name}`)}>
        <ArrowLeft className="size-4" />
        Back to {resource.label}
      </Button>
      <h1 className="mb-4 text-lg font-semibold tracking-tight">
        {resource.label} #{id}
      </h1>
      {query.isLoading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !result ? (
        <p className="text-sm text-muted-foreground">Not found.</p>
      ) : (
        <dl className="max-w-2xl divide-y rounded-lg border">
          {Object.entries(result).map(([key, value]) => (
            <div key={key} className="flex gap-4 px-4 py-3 text-sm">
              <dt className="w-44 shrink-0 font-medium text-muted-foreground">{key}</dt>
              <dd className="min-w-0 break-words font-mono text-xs">
                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '—')}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

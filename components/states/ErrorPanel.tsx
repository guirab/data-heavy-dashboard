'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DatasetError } from '@/lib/data/client'

const KIND_LABEL: Record<DatasetError['kind'], { title: string; hint: string }> = {
  network: { title: 'Could not download the dataset', hint: 'The static files did not arrive. Check the connection and retry; the summary above is still valid.' },
  integrity: { title: 'Downloaded file failed its checksum', hint: 'The bytes do not match the manifest hash — a truncated or cached-but-changed file. Retry downloads it again, bypassing the browser cache.' },
  format: { title: 'Dataset file has an unexpected shape', hint: 'The columnar file and its manifest disagree. This is a build problem, not a network one; retrying will not help.' },
  engine: { title: 'The query engine failed', hint: 'The worker threw while filtering or sorting. Retry starts a fresh worker and reloads the year.' },
  worker: { title: 'The data worker crashed', hint: 'Usually the browser ran out of memory for this tab. Retry starts a fresh worker and reloads the year; if it fails again, reload the page.' },
}

interface ErrorPanelProps {
  error: DatasetError
  onRetry: () => void
}

export function ErrorPanel({ error, onRetry }: ErrorPanelProps) {
  const { title, hint } = KIND_LABEL[error.kind]
  return (
    <div role="alert" className="rounded-lg border border-status-critical/40 bg-card p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-status-critical" />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
          <p className="mt-2 break-words font-mono text-xs text-muted-foreground">{error.message}</p>
        </div>
      </div>
      {error.kind !== 'format' && (
        <Button className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

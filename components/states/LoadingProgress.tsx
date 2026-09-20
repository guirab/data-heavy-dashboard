'use client'

import type { LoadProgress } from '@/types/query'
import { formatInt } from '@/lib/data/format'

const PHASE_LABEL: Record<LoadProgress['phase'], string> = {
  manifest: 'Reading manifest',
  dictionary: 'Loading dictionaries',
  columns: 'Downloading budget lines',
  verify: 'Verifying checksum',
  inflate: 'Decompressing',
  decode: 'Decoding columns',
  index: 'Building search index',
}

interface LoadingProgressProps {
  progress: LoadProgress | null
  rows?: number
}

export function LoadingProgress({ progress, rows }: LoadingProgressProps) {
  const total = progress?.total ?? 0
  const loaded = progress?.loaded ?? 0
  const pct = total > 0 ? Math.round((100 * loaded) / total) : 0
  const label = progress ? PHASE_LABEL[progress.phase] : 'Starting worker'
  const mb = (b: number) => (b / 1e6).toFixed(1)
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      {/* Only the phase label is live: one announcement per phase, not one per received chunk.
          (aria-busy on a live region would tell the reader to hold announcements instead.) */}
      <p className="text-sm font-medium" aria-live="polite" aria-atomic="true">
        {label}
        {rows ? ` — ${formatInt(rows)} budget lines` : ''}
      </p>
      <div
        role="progressbar"
        aria-label="Dataset download"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={total > 0 ? `${pct}%, ${mb(loaded)} of ${mb(total)} MB` : undefined}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular" aria-hidden="true">
        {total > 0 ? `${mb(loaded)} of ${mb(total)} MB (gzip)` : '…'}
      </p>
    </div>
  )
}

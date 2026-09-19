'use client'

import { useEffect, useState } from 'react'
import type { PerfEntry } from '@/lib/perf'
import type { QueryStats } from '@/hooks/useDataset'

interface PerfOverlayProps {
  stats: QueryStats | null
  rows: number | null
}

/** Debug overlay (?perf=1): last interaction timings from window.__perfLog. */
export function PerfOverlay({ stats, rows }: PerfOverlayProps) {
  const [entries, setEntries] = useState<PerfEntry[]>([])
  useEffect(() => {
    const t = setInterval(() => setEntries((window.__perfLog ?? []).slice(-6)), 250)
    return () => clearInterval(t)
  }, [])
  return (
    <aside aria-label="Performance log" className="fixed bottom-3 right-3 z-50 w-72 rounded-md border border-border bg-popover/95 p-2 font-mono text-[11px] shadow-lg backdrop-blur">
      <p className="mb-1 font-semibold">perf · {rows !== null ? `${rows.toLocaleString('en-US')} rows` : '—'}</p>
      {stats && (
        <p className="text-muted-foreground">
          engine {stats.engineMs.toFixed(1)}ms · round-trip {stats.roundTripMs.toFixed(1)}ms
        </p>
      )}
      <ul className="mt-1 space-y-0.5">
        {entries.map((e) => (
          <li key={e.at + e.name} className="flex justify-between gap-2">
            <span className="truncate">{e.name}</span>
            <span className={e.ms > 200 ? 'text-status-critical' : ''}>{e.ms.toFixed(1)}ms</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

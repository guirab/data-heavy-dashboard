/**
 * Interaction timing: mark when the user acts, measure when the table
 * commits and again after the next frame paints. Entries are kept on
 * window.__perfLog so scripts/perf/measure.ts and the ?perf=1 overlay can
 * read them.
 */
export interface PerfEntry {
  name: string
  /** interaction -> pixels on screen (two animation frames after commit), ms */
  ms: number
  /** interaction -> React commit (layout effect), ms */
  commitMs: number
  /** engine time for the same interaction (worker or main thread), ms */
  engineMs?: number
  rows?: number
  at: number
  done: boolean
}

declare global {
  interface Window {
    __perfLog?: PerfEntry[]
  }
}

let pendingMark: { name: string; t: number } | null = null

export function markInteraction(name: string) {
  if (typeof performance === 'undefined') return
  pendingMark = { name, t: performance.now() }
  performance.mark(`interaction:${name}`)
}

export function measureCommit(extra: { engineMs?: number; rows?: number } = {}): PerfEntry | null {
  if (!pendingMark || typeof performance === 'undefined') return null
  const { name, t } = pendingMark
  pendingMark = null
  const commitMs = performance.now() - t
  const entry: PerfEntry = { name, ms: commitMs, commitMs, at: Date.now(), done: false, ...extra }
  try {
    performance.measure(`interaction→commit:${name}`, `interaction:${name}`)
  } catch {
    /* mark may have been cleared */
  }
  if (typeof window !== 'undefined') {
    ;(window.__perfLog ??= []).push(entry)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        entry.ms = performance.now() - t
        entry.done = true
        performance.mark(`paint:${name}`)
      }),
    )
  }
  return entry
}

/**
 * Interaction timing: mark when the user acts, measure when the table
 * commits. Entries are kept on window.__perfLog so scripts/perf/measure.ts
 * and the ?perf=1 overlay can read them.
 */
export interface PerfEntry {
  name: string
  /** interaction -> DOM commit, ms */
  ms: number
  /** worker engine time for the same interaction, ms (when known) */
  engineMs?: number
  rows?: number
  at: number
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
  const ms = performance.now() - pendingMark.t
  const entry: PerfEntry = { name: pendingMark.name, ms, at: Date.now(), ...extra }
  try {
    performance.measure(`interaction→commit:${pendingMark.name}`, `interaction:${pendingMark.name}`)
  } catch {
    /* mark may have been cleared */
  }
  pendingMark = null
  if (typeof window !== 'undefined') (window.__perfLog ??= []).push(entry)
  return entry
}

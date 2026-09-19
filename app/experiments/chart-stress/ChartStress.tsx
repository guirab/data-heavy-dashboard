'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'

const SIZES = [1_000, 10_000, 50_000, 100_000] as const
type Size = (typeof SIZES)[number]

interface Result {
  points: number
  /** setState → next painted frame: React render + commit + layout + paint of the SVG. */
  rechartsPaintMs: number
  svgNodes: number
  canvasMs: number
}

/** Deterministic points so runs are comparable (seeded LCG). */
function makePoints(n: number) {
  let s = 42
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
  return Array.from({ length: n }, () => ({ x: Math.round(rnd() * 12 * 100) / 100, y: Math.round(rnd() * rnd() * 1e6) }))
}

declare global {
  interface Window {
    __chartStress?: Result[]
  }
}

/**
 * Does Recharts hold up at data size? Same points drawn as SVG circles through
 * Recharts and as pixels on a canvas. Time is setState → two animation frames
 * later (React's Profiler is a no-op in production builds, so commit alone is
 * not separated here).
 */
export function ChartStress() {
  const [size, setSize] = useState<Size | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [runningAll, setRunningAll] = useState(false)
  const points = size ? makePoints(size) : []
  const t0 = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!size) return
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const paint = performance.now() - t0.current
        const svgNodes = host.current?.querySelectorAll('svg *').length ?? 0
        // Canvas: same points, no DOM.
        const c = canvasRef.current!
        const ctx = c.getContext('2d')!
        const t = performance.now()
        ctx.clearRect(0, 0, c.width, c.height)
        ctx.fillStyle = 'rgba(42,120,214,0.6)'
        const pts = makePoints(size)
        for (const p of pts) ctx.fillRect((p.x / 12) * c.width, c.height - (p.y / 1e6) * c.height, 2, 2)
        const canvasMs = performance.now() - t
        const r: Result = { points: size, rechartsPaintMs: paint, svgNodes, canvasMs }
        setResults((rs) => [...rs.filter((x) => x.points !== size), r].sort((a, b) => a.points - b.points))
        window.__chartStress = [...(window.__chartStress ?? []).filter((x) => x.points !== size), r]
      }),
    )
  }, [size])

  const start = (s: Size) => {
    t0.current = performance.now()
    setSize(s)
  }

  // "Run all": advance to the next size once the current one has a result.
  useEffect(() => {
    if (!runningAll) return
    const next = SIZES.find((s) => !results.some((r) => r.points === s))
    const id = setTimeout(() => {
      if (!next) setRunningAll(false)
      else if (size !== next) start(next)
    }, 300)
    return () => clearTimeout(id)
  }, [runningAll, results, size])

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Experiment — Recharts under load</h1>
      <p className="text-sm text-muted-foreground">
        Same N points as an SVG scatter through Recharts and as pixels on a canvas. The dashboard&apos;s charts have 36 bars and 3×12 points; this page
        answers where the library stops being an option. Numbers land in <code>docs/perf.md</code>. <Link className="underline" href="/">Back to the dashboard</Link>.
      </p>
      <div className="flex flex-wrap gap-2">
        {SIZES.map((s) => (
          <Button key={s} variant="outline" size="sm" onClick={() => start(s)} disabled={runningAll}>
            {s.toLocaleString('en-US')} points
          </Button>
        ))}
        <Button size="sm" onClick={() => { setResults([]); window.__chartStress = []; setRunningAll(true) }} disabled={runningAll}>
          Run all (100k SVG points can take &gt;10 s)
        </Button>
      </div>
      <table className="w-full max-w-2xl text-sm tabular">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Points</th>
            <th className="py-1 text-right font-medium">Recharts (SVG) to paint</th>
            <th className="py-1 text-right font-medium">SVG nodes</th>
            <th className="py-1 text-right font-medium">Canvas draw</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.points} className="border-t border-border/60">
              <td className="py-1">{r.points.toLocaleString('en-US')}</td>
              <td className="py-1 text-right">{r.rechartsPaintMs.toFixed(0)} ms</td>
              <td className="py-1 text-right">{r.svgNodes.toLocaleString('en-US')}</td>
              <td className="py-1 text-right">{r.canvasMs.toFixed(1)} ms</td>
            </tr>
          ))}
          {results.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-muted-foreground">No runs yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="grid gap-4 md:grid-cols-2">
        <div ref={host} className="rounded-lg border border-border p-2">
          <p className="mb-1 text-xs text-muted-foreground">Recharts (SVG) — {points.length.toLocaleString('en-US')} points</p>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <XAxis type="number" dataKey="x" domain={[0, 12]} tick={{ fontSize: 11 }} />
              <YAxis type="number" dataKey="y" domain={[0, 1e6]} tick={{ fontSize: 11 }} width={60} />
              <Scatter data={points} fill="var(--chart-1)" isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border p-2">
          <p className="mb-1 text-xs text-muted-foreground">Canvas 2D — same points</p>
          <canvas ref={canvasRef} width={520} height={300} className="h-[300px] w-full" aria-label="Canvas rendering of the same points" />
        </div>
      </div>
    </main>
  )
}

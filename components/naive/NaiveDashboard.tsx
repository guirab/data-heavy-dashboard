'use client'

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FilterBar } from '@/components/filters/FilterBar'
import { KpiTiles } from '@/components/KpiTiles'
import { PageHeader } from '@/components/PageHeader'
import { PerfOverlay } from '@/components/PerfOverlay'
import { LoadingProgress } from '@/components/states/LoadingProgress'
import type { DashboardProps } from '@/components/Dashboard'
import { formatBRL, formatInt, MONTHS_PT } from '@/lib/data/format'
import { loadYear } from '@/lib/data/loader'
import { materialize, naiveQuery, type NaiveRow } from '@/lib/data/naive'
import { activeChips, filtersReducer, parseFilters, type FilterAction } from '@/lib/filters/filters'
import { markInteraction, measureCommit } from '@/lib/perf'
import type { Dictionaries } from '@/types/dataset'
import type { LoadProgress, SortKey } from '@/types/query'

const COLS: Array<{ key: keyof NaiveRow; label: string; numeric?: boolean }> = [
  { key: 'month', label: 'Month' },
  { key: 'orgSup', label: 'Agency' },
  { key: 'orgSub', label: 'Sub-agency' },
  { key: 'funcao', label: 'Function' },
  { key: 'programa', label: 'Program' },
  { key: 'acao', label: 'Action' },
  { key: 'po', label: 'Budget plan' },
  { key: 'grupo', label: 'Group' },
  { key: 'elemento', label: 'Element' },
  { key: 'modalidade', label: 'Modality' },
  { key: 'uf', label: 'UF' },
  { key: 'empenhado', label: 'Committed', numeric: true },
  { key: 'liquidado', label: 'Verified', numeric: true },
  { key: 'pago', label: 'Paid', numeric: true },
  { key: 'gap', label: 'Gap', numeric: true },
]

const cell = (r: NaiveRow, key: keyof NaiveRow) => {
  const v = r[key]
  if (key === 'month') return MONTHS_PT[(v as number) - 1]
  return typeof v === 'number' ? formatBRL(v) : v === '' || v === null ? '—' : String(v)
}

/**
 * Baseline for docs/perf.md. Stage A (?mode=naive): objects + main-thread
 * filter/sort + a plain <table> with every row. Stage B (?mode=naive&virtual=1):
 * same compute, rows virtualized. `rows=N` caps the DOM for the measurements.
 */
export function NaiveDashboard({ index, initialYear }: DashboardProps) {
  const years = index.years
  const yearNumbers = useMemo(() => years.map((y) => y.year), [years])
  const [filters, rawDispatch] = useReducer(filtersReducer, undefined, () => parseFilters(window.location.search, initialYear, yearNumbers))
  const [opts] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    const cap = p.get('rows')
    return { virtual: p.get('virtual') === '1', cap: cap === 'all' ? Infinity : Number(cap) || 50_000, perf: p.get('perf') === '1' }
  })
  const dispatch = (a: FilterAction) => {
    markInteraction(a.type === 'toggleCode' || a.type === 'setCodes' ? `filter:${a.dim}` : a.type)
    rawDispatch(a)
  }

  const [loaded, setLoaded] = useState<{ year: number; rows: NaiveRow[]; dict: Dictionaries; total: number; ms: number } | null>(null)
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  useEffect(() => {
    let alive = true
    loadYear(filters.year, (p) => alive && setProgress(p)).then((y) => {
      if (!alive) return
      const t = performance.now()
      const rows = materialize(y.columns, y.dict)
      setLoaded({ year: filters.year, rows, dict: y.dict, total: rows.length, ms: performance.now() - t })
    })
    return () => {
      alive = false
    }
  }, [filters.year])

  // Everything below runs synchronously on the main thread, inside render.
  const result = useMemo(() => (loaded && loaded.year === filters.year ? naiveQuery(loaded.rows, filters) : null), [loaded, filters])
  const totals = useMemo(() => {
    const t = { empenhado: 0, liquidado: 0, pago: 0, gap: 0 }
    if (!result) return t
    for (const r of result.rows) {
      t.empenhado += r.empenhado
      t.liquidado += r.liquidado
      t.pago += r.pago
    }
    t.gap = t.empenhado - t.pago
    return t
  }, [result])
  const shown = result ? (Number.isFinite(opts.cap) ? result.rows.slice(0, opts.cap) : result.rows) : []

  useLayoutEffect(() => {
    if (result) measureCommit({ engineMs: result.ms, rows: result.rows.length })
  }, [result])

  const yearInfo = years.find((y) => y.year === filters.year) ?? years[0]
  const chips = activeChips(filters, loaded?.dict ?? null)

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6">
      <PageHeader source={index.source} sourceLastModified={yearInfo.sourceLastModified} lastPublished={index.lastPublished} />
      <p role="note" className="rounded-md border border-status-warning/50 bg-status-warning/10 px-3 py-2 text-sm">
        <strong>Naive baseline</strong> ({opts.virtual ? 'stage B: virtualized rows, main-thread compute' : 'stage A: plain table, main-thread compute'}
        {Number.isFinite(opts.cap) ? `, DOM capped at ${formatInt(opts.cap)} rows — add rows=all to remove the cap` : ', no cap'}). Kept for the before/after
        numbers in docs/perf.md; the real dashboard is at{' '}
        <Link className="underline" href="/">
          /
        </Link>
        .
      </p>
      <FilterBar filters={filters} dispatch={dispatch} years={years} dict={loaded?.dict ?? null} activeCount={chips.length} />
      <KpiTiles totals={totals} preview={!result} />
      <section aria-labelledby="naive-lines" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 id="naive-lines" className="font-medium">
            Budget lines
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {result ? `${formatInt(result.rows.length)} of ${formatInt(loaded!.total)} lines match · filter+sort ${result.ms.toFixed(0)}ms on the main thread` : ''}
            {loaded && ` · materialized ${formatInt(loaded.total)} objects in ${loaded.ms.toFixed(0)}ms`}
          </p>
        </div>
        {!loaded && <LoadingProgress progress={progress} rows={yearInfo.rows} />}
        {result && (opts.virtual ? <VirtualRows rows={shown} onSort={(k) => dispatch({ type: 'sort', key: k as SortKey })} /> : <PlainTable rows={shown} onSort={(k) => dispatch({ type: 'sort', key: k as SortKey })} />)}
      </section>
      {opts.perf && <PerfOverlay stats={result ? { engineMs: result.ms, roundTripMs: result.ms } : null} rows={result?.rows.length ?? null} />}
    </main>
  )
}

function PlainTable({ rows, onSort }: { rows: NaiveRow[]; onSort: (k: keyof NaiveRow & string) => void }) {
  return (
    <div className="max-h-[560px] overflow-auto rounded-lg border border-border">
      <table className="w-max text-sm">
        <thead className="sticky top-0 bg-card">
          <tr>
            {COLS.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? 'px-2 py-2 text-right' : 'px-2 py-2 text-left'}>
                <button type="button" className="text-xs font-medium text-muted-foreground" onClick={() => onSort(c.key as keyof NaiveRow & string)}>
                  {c.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/60">
              {COLS.map((c) => (
                <td key={c.key} className={c.numeric ? 'whitespace-nowrap px-2 py-1.5 text-right' : 'max-w-60 truncate px-2 py-1.5'}>
                  {cell(r, c.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VirtualRows({ rows, onSort }: { rows: NaiveRow[]; onSort: (k: keyof NaiveRow & string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => ref.current, estimateSize: () => 36, overscan: 8 })
  return (
    <div ref={ref} className="h-[560px] overflow-auto rounded-lg border border-border text-sm">
      <div className="sticky top-0 z-10 flex w-max bg-card">
        {COLS.map((c) => (
          <button key={c.key} type="button" className="w-40 shrink-0 px-2 py-2 text-left text-xs font-medium text-muted-foreground" onClick={() => onSort(c.key as keyof NaiveRow & string)}>
            {c.label}
          </button>
        ))}
      </div>
      <div style={{ height: v.getTotalSize(), position: 'relative' }} className="w-max">
        {v.getVirtualItems().map((it) => {
          const r = rows[it.index]
          return (
            <div key={it.key} className="absolute left-0 flex h-9 items-center border-t border-border/60 tabular" style={{ transform: `translateY(${it.start}px)` }}>
              {COLS.map((c) => (
                <span key={c.key} className={c.numeric ? 'w-40 shrink-0 truncate px-2 text-right' : 'w-40 shrink-0 truncate px-2'}>
                  {cell(r, c.key)}
                </span>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

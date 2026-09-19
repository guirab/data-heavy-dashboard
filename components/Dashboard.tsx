'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useState } from 'react'
import { AgencyRanking } from '@/components/charts/AgencyRanking'
import { CumulativeChart } from '@/components/charts/CumulativeChart'
import { BudgetLinesTable } from '@/components/BudgetLinesTable'
import { FilterBar } from '@/components/filters/FilterBar'
import { KpiTiles } from '@/components/KpiTiles'
import { PerfOverlay } from '@/components/PerfOverlay'
import { NoAgencyNotice, PartialDataBanner } from '@/components/states/Banners'
import { PageHeader } from '@/components/PageHeader'
import { EmptyFilter } from '@/components/states/EmptyFilter'
import { ErrorPanel } from '@/components/states/ErrorPanel'
import { LoadingProgress } from '@/components/states/LoadingProgress'
import { useDatasetClient, useQuery, useYear } from '@/hooks/useDataset'
import { fromPreAggregates, fromResult, type AgencyMonthRow, type AgencyStat } from '@/lib/data/aggregates'
import { formatInt } from '@/lib/data/format'
import { activeChips, filtersReducer, parseFilters, serializeFilters, toQuery, type FilterAction } from '@/lib/filters/filters'
import { markInteraction } from '@/lib/perf'
import { DEFAULT_QUERY } from '@/types/query'

export interface DataIndex {
  years: Array<{ year: number; months: number[]; partial: boolean; rows: number; rawRows: number; sourceLastModified: string | null }>
  lastPublished: { year: number; month: number }
  source: { name: string; publisher: string; page: string; dictionary: string }
}

export type YearlyRow = { year: number; orgSup: string | null; name: string; empenhado: number; liquidado: number; pago: number }

export interface DashboardProps {
  index: DataIndex
  initialYear: number
  initialAgencyMonth: AgencyMonthRow[]
  yearly: YearlyRow[]
}

export function Dashboard({ index, initialYear, initialAgencyMonth, yearly }: DashboardProps) {
  const years = index.years
  const yearNumbers = useMemo(() => years.map((y) => y.year), [years])
  // Client-only component (see DashboardLoader): the URL is the initial state, and stays in sync.
  const [filters, rawDispatch] = useReducer(filtersReducer, undefined, () => parseFilters(window.location.search, initialYear, yearNumbers))
  const [perf] = useState(() => new URLSearchParams(window.location.search).get('perf') === '1')
  const [sortStrategy] = useState<'radix' | 'comparator'>(() => (new URLSearchParams(window.location.search).get('engine') === 'comparator' ? 'comparator' : 'radix'))
  useEffect(() => {
    const next = serializeFilters(filters, initialYear)
    const keep = new URLSearchParams(window.location.search)
    const extra = ['mode', 'perf', 'engine'].filter((k) => keep.has(k)).map((k) => `${k}=${keep.get(k)}`)
    const qs = next + (extra.length ? (next ? '&' : '?') + extra.join('&') : '')
    if (window.location.search !== qs) window.history.replaceState(null, '', window.location.pathname + qs)
  }, [filters, initialYear])

  const dispatch = useCallback((a: FilterAction) => {
    markInteraction(a.type === 'toggleCode' || a.type === 'setCodes' ? `filter:${a.dim}` : a.type)
    rawDispatch(a)
  }, [])

  const client = useDatasetClient()
  const { state, retry } = useYear(client, filters.year)
  const data = state.status === 'ready' ? state.data : null
  const yearInfo = years.find((y) => y.year === filters.year) ?? years[0]

  const query = useMemo(() => (data ? { ...toQuery(filters, data.dict), sortStrategy } : null), [filters, data, sortStrategy])
  // Typing in the search box updates the input immediately; the worker query follows.
  const deferredQuery = useDeferredValue(query)
  const { result, stats, pending, error: queryError } = useQuery(client, !!data && !!deferredQuery, String(filters.year), deferredQuery ?? DEFAULT_QUERY)

  // Pre-aggregates paint the primary view before (and while) the slice loads.
  const [preAgg, setPreAgg] = useState<{ year: number; rows: AgencyMonthRow[] }>({ year: initialYear, rows: initialAgencyMonth })
  useEffect(() => {
    if (preAgg.year === filters.year) return
    let alive = true
    fetch(`/data/v1/${filters.year}/agg/agency-month.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: AgencyMonthRow[]) => alive && setPreAgg({ year: filters.year, rows }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [filters.year, preAgg.year])

  const view = useMemo(() => {
    if (result && data) return fromResult(result, data.dict, filters.months, yearInfo.months)
    return fromPreAggregates(preAgg.year === filters.year ? preAgg.rows : [], filters.months, yearInfo.months, filters.codes.orgSup, filters.includeNoAgency)
  }, [result, data, filters.year, filters.months, filters.codes.orgSup, filters.includeNoAgency, yearInfo.months, preAgg])

  const previousYear = years.find((y) => y.year === filters.year - 1 && !y.partial)?.year
  const previous = useMemo(() => {
    if (!previousYear) return null
    const m = new Map<string, AgencyStat>()
    for (const r of yearly) {
      if (r.year !== previousYear || r.orgSup === null) continue
      m.set(r.orgSup, { code: r.orgSup, name: r.name, empenhado: r.empenhado, liquidado: r.liquidado, pago: r.pago, gap: r.empenhado - r.pago, gapPct: r.empenhado ? (r.empenhado - r.pago) / r.empenhado : NaN })
    }
    return m
  }, [yearly, previousYear])

  const chips = activeChips(filters, data?.dict ?? null)
  const scopeLabel = filters.codes.orgSup?.length ? chips.filter((c) => c.dim === 'orgSup').map((c) => c.label).join(', ') : 'all agencies'
  const matched = result?.ids.length ?? null

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6">
      <PageHeader source={index.source} sourceLastModified={yearInfo.sourceLastModified} lastPublished={index.lastPublished} />

      {yearInfo.partial && <PartialDataBanner year={yearInfo.year} months={yearInfo.months} />}

      <section aria-label="Filters and headline numbers" className="flex flex-col gap-4">
        <FilterBar filters={filters} dispatch={dispatch} years={years} dict={data?.dict ?? null} activeCount={chips.length} />
        <KpiTiles totals={view.totals} preview={view.source === 'preview'} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AgencyRanking
          agencies={view.agencies}
          previous={previous}
          previousYear={previousYear}
          selectedCodes={filters.codes.orgSup ?? []}
          onToggleAgency={(code) => dispatch({ type: 'toggleCode', dim: 'orgSup', code })}
          preview={view.source === 'preview'}
          year={filters.year}
        />
        <CumulativeChart series={view.series} year={filters.year} partial={yearInfo.partial} preview={view.source === 'preview'} scopeLabel={scopeLabel} />
      </div>

      <section aria-labelledby="lines-title" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="lines-title" className="font-medium">
            Budget lines
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
            {matched !== null
              ? `${formatInt(matched)} of ${formatInt(yearInfo.rows)} lines match${pending ? ' (updating…)' : ''}`
              : state.status === 'loading'
                ? `Loading ${formatInt(yearInfo.rows)} lines…`
                : ''}
          </p>
        </div>
        {result && <NoAgencyNotice rows={result.noAgencyRows} included={filters.includeNoAgency} onToggle={(v) => dispatch({ type: 'includeNoAgency', value: v })} />}
        {state.status === 'loading' && <LoadingProgress progress={state.progress} rows={yearInfo.rows} />}
        {state.status === 'error' && <ErrorPanel error={state.error} onRetry={retry} />}
        {queryError && <ErrorPanel error={queryError} onRetry={retry} />}
        {data && result && result.ids.length === 0 && (
          <EmptyFilter total={yearInfo.rows} chips={chips.map((c) => c.label)} onClearLast={() => dispatch({ type: 'clearLast' })} onClearAll={() => dispatch({ type: 'clearAll' })} />
        )}
        {data && result && result.ids.length > 0 && (
          <BudgetLinesTable columns={data.columns} dict={data.dict} ids={result.ids} sort={filters.sort} onSort={(key) => dispatch({ type: 'sort', key })} engineMs={result.engineMs} />
        )}
        <p className="text-xs text-muted-foreground">
          Keyboard: Tab into the grid, arrows move between cells, Page Up/Down scroll, Ctrl+Home/End jump. Column headers sort. ‡ marks a name the source
          truncates at 45 bytes.
        </p>
      </section>

      <footer className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
        <p>
          Data:{' '}
          <a className="underline underline-offset-2" href={index.source.dictionary} target="_blank" rel="noreferrer">
            data dictionary
          </a>{' '}
          · Decision log and defect table in the{' '}
          <a className="underline underline-offset-2" href="https://github.com/guirab/data-heavy-dashboard#readme" target="_blank" rel="noreferrer">
            README
          </a>
          . Amounts are in Brazilian reais (R$), integer centavos summed without rounding.
        </p>
      </footer>
      {perf && <PerfOverlay stats={stats} rows={matched} />}
    </main>
  )
}

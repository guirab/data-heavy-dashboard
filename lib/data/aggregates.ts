/**
 * View models for the primary view. Two producers, one shape: the build-time
 * pre-aggregates (first paint, before the slice arrives) and the worker's live
 * result (every filter applied).
 */
import { MEASURES, type Dictionaries } from '../../types/dataset.ts'
import type { QueryResult } from '../../types/query.ts'

export interface AgencyStat {
  code: string | null
  name: string
  empenhado: number
  liquidado: number
  pago: number
  /** empenhado - pago, integer centavos */
  gap: number
  /** gap / empenhado, 0..1 (NaN when empenhado is 0) */
  gapPct: number
}

export interface MonthPoint {
  month: number
  /** cumulative to this month */
  empenhado: number
  liquidado: number
  pago: number
}

export interface Totals {
  empenhado: number
  liquidado: number
  pago: number
  gap: number
}

export interface PrimaryView {
  agencies: AgencyStat[]
  series: MonthPoint[]
  totals: Totals
  /** 'preview' = from pre-aggregates (year/months/agency filters only); 'live' = every filter applied. */
  source: 'preview' | 'live'
}

export type AgencyMonthRow = { orgSup: string | null; name: string; month: number } & Record<(typeof MEASURES)[number], number>

const NM = MEASURES.length
const stat = (code: string | null, name: string, e: number, l: number, p: number): AgencyStat => ({
  code,
  name,
  empenhado: e,
  liquidado: l,
  pago: p,
  gap: e - p,
  gapPct: e === 0 ? NaN : (e - p) / e,
})

function finish(agencies: AgencyStat[], months: number[], byMonth: Map<number, [number, number, number]>, source: PrimaryView['source']): PrimaryView {
  agencies.sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name, 'pt-BR'))
  const series: MonthPoint[] = []
  let e = 0
  let l = 0
  let p = 0
  for (const m of months) {
    const v = byMonth.get(m) ?? [0, 0, 0]
    e += v[0]
    l += v[1]
    p += v[2]
    series.push({ month: m, empenhado: e, liquidado: l, pago: p })
  }
  const totals: Totals = { empenhado: e, liquidado: l, pago: p, gap: e - p }
  return { agencies, series, totals, source }
}

/** From agg/agency-month.json; honours the month range and an agency-code filter, ignores everything else. */
export function fromPreAggregates(rows: AgencyMonthRow[], months: [number, number], availableMonths: number[], agencyCodes: string[] | undefined, includeNoAgency: boolean): PrimaryView {
  const byAgency = new Map<string | null, AgencyStat>()
  const byMonth = new Map<number, [number, number, number]>()
  const codeSet = agencyCodes?.length ? new Set(agencyCodes) : null
  for (const r of rows) {
    if (r.month < months[0] || r.month > months[1]) continue
    if (r.orgSup === null && !includeNoAgency) continue
    // Ranking ignores the agency filter (emphasis, not isolation); totals and series honour it.
    const cur = byAgency.get(r.orgSup) ?? stat(r.orgSup, r.orgSup === null ? 'No agency (source has none)' : r.name, 0, 0, 0)
    byAgency.set(r.orgSup, stat(r.orgSup, cur.name, cur.empenhado + r.empenhado, cur.liquidado + r.liquidado, cur.pago + r.pago))
    if (codeSet && (r.orgSup === null || !codeSet.has(r.orgSup))) continue
    const m = byMonth.get(r.month) ?? [0, 0, 0]
    m[0] += r.empenhado
    m[1] += r.liquidado
    m[2] += r.pago
    byMonth.set(r.month, m)
  }
  const visible = availableMonths.filter((m) => m >= months[0] && m <= months[1])
  return finish([...byAgency.values()], visible, byMonth, 'preview')
}

/** From the worker result: every filter is already applied. */
export function fromResult(result: QueryResult, dict: Dictionaries, months: [number, number], availableMonths: number[]): PrimaryView {
  const agencies: AgencyStat[] = []
  for (let id = 0; id < dict.orgSup.length; id++) {
    const base = id * NM
    const e = result.byAgency[base]
    const l = result.byAgency[base + 1]
    const p = result.byAgency[base + 2]
    if (e === 0 && l === 0 && p === 0) continue
    const entry = dict.orgSup[id]
    agencies.push(stat(entry.code, id === 0 ? 'No agency (source has none)' : entry.displayName ?? entry.name, e, l, p))
  }
  const byMonth = new Map<number, [number, number, number]>()
  for (let m = 1; m <= 12; m++) {
    const base = (m - 1) * NM
    byMonth.set(m, [result.byMonth[base], result.byMonth[base + 1], result.byMonth[base + 2]])
  }
  const visible = availableMonths.filter((m) => m >= months[0] && m <= months[1])
  return finish(agencies, visible, byMonth, 'live')
}

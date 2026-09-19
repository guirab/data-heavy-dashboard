/**
 * Groups normalized rows to the served grain (G2b: the 11 dimensions × month)
 * and builds the small pre-aggregates the primary view paints from before the
 * columnar file arrives. Sums are integer centavos, so they are exact.
 */
import { DIMENSIONS, MEASURES, type Dictionaries } from '../../types/dataset.ts'
import { type Row } from './schema.ts'

export const DEF18 = {
  id: 'DEF-18',
  title: 'Monthly files are deltas, not year-to-date',
  problem: 'Nothing in the file says whether a month\'s values are the month\'s movement or the cumulative position. They are deltas: January 2025 alone shows R$1.76T committed (annual payroll and debt are committed up front), later months show only what changed.',
  rule: 'Sum months to get the year; compute cumulative series in the aggregation step. Documented because a YTD reading would over-count twelvefold.',
  action: 'document' as const,
  columns: ['Ano e mês do lançamento', 'Valor Empenhado (R$)', 'Valor Pago (R$)'],
}

const NM = MEASURES.length
const ND = DIMENSIONS.length

export interface Grouped {
  rows: number
  /** dimension ids per row, column-major: dims[d][row] */
  dims: Uint32Array[]
  month: Uint8Array
  /** measures per row, column-major: values[m][row] */
  values: Float64Array[]
}

export class Aggregator {
  private groups = new Map<string, Float64Array>()
  private keys = new Map<string, { ids: number[]; month: number }>()
  /** Raw totals across every input row (including rows later dropped), per measure — the validation oracle. */
  readonly rawTotals = new Float64Array(NM)
  readonly keptTotals = new Float64Array(NM)

  addRaw(row: Row) {
    for (let m = 0; m < NM; m++) this.rawTotals[m] += row.v[m]
  }

  add(ids: number[], row: Row) {
    const key = `${row.month}|${ids.join('|')}`
    let acc = this.groups.get(key)
    if (!acc) {
      acc = new Float64Array(NM)
      this.groups.set(key, acc)
      this.keys.set(key, { ids, month: row.month })
    }
    for (let m = 0; m < NM; m++) {
      acc[m] += row.v[m]
      this.keptTotals[m] += row.v[m]
    }
  }

  /** Materialize as sorted columns (deterministic order: dims in DIMENSIONS order, then month). */
  finalize(): Grouped {
    const entries = [...this.keys.entries()].map(([key, k]) => ({ key, ...k }))
    entries.sort((a, b) => {
      for (let d = 0; d < ND; d++) if (a.ids[d] !== b.ids[d]) return a.ids[d] - b.ids[d]
      return a.month - b.month
    })
    const rows = entries.length
    const dims = DIMENSIONS.map(() => new Uint32Array(rows))
    const month = new Uint8Array(rows)
    const values = MEASURES.map(() => new Float64Array(rows))
    entries.forEach((e, r) => {
      for (let d = 0; d < ND; d++) dims[d][r] = e.ids[d]
      month[r] = e.month
      const acc = this.groups.get(e.key)!
      for (let m = 0; m < NM; m++) values[m][r] = acc[m]
    })
    return { rows, dims, month, values }
  }
}

export interface AggRecord {
  [k: string]: string | number | null
}

const sumInto = (acc: Map<string, Float64Array>, key: string, g: Grouped, r: number) => {
  let a = acc.get(key)
  if (!a) acc.set(key, (a = new Float64Array(NM)))
  for (let m = 0; m < NM; m++) a[m] += g.values[m][r]
}

const measuresOf = (a: Float64Array) => Object.fromEntries(MEASURES.map((m, i) => [m, a[i]]))

/** Pre-aggregates the primary view needs; keyed by codes (not ids) so years are comparable. */
export function preAggregates(g: Grouped, dict: Dictionaries) {
  const dIdx = (d: (typeof DIMENSIONS)[number]) => DIMENSIONS.indexOf(d)
  const orgSup = g.dims[dIdx('orgSup')]
  const funcao = g.dims[dIdx('funcao')]
  const grupo = g.dims[dIdx('grupo')]

  const agencyMonth = new Map<string, Float64Array>()
  const agencyFuncao = new Map<string, Float64Array>()
  const agencyGrupo = new Map<string, Float64Array>()
  const totalsMonth = new Map<string, Float64Array>()
  for (let r = 0; r < g.rows; r++) {
    sumInto(agencyMonth, `${orgSup[r]}|${g.month[r]}`, g, r)
    sumInto(agencyFuncao, `${orgSup[r]}|${funcao[r]}`, g, r)
    sumInto(agencyGrupo, `${orgSup[r]}|${grupo[r]}`, g, r)
    sumInto(totalsMonth, `${g.month[r]}`, g, r)
  }
  const entry = (dim: (typeof DIMENSIONS)[number], id: number) => {
    const e = dict[dim][id]
    return { code: e.code, name: e.displayName ?? e.name }
  }
  const sortKeys = (m: Map<string, Float64Array>) => [...m.keys()].sort((a, b) => {
    const pa = a.split('|').map(Number)
    const pb = b.split('|').map(Number)
    for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
    return 0
  })
  return {
    agencyMonth: sortKeys(agencyMonth).map((k) => {
      const [id, month] = k.split('|').map(Number)
      const e = entry('orgSup', id)
      return { orgSup: e.code, name: e.name, month, ...measuresOf(agencyMonth.get(k)!) }
    }),
    agencyFuncao: sortKeys(agencyFuncao).map((k) => {
      const [id, f] = k.split('|').map(Number)
      const e = entry('orgSup', id)
      const fe = entry('funcao', f)
      return { orgSup: e.code, name: e.name, funcao: fe.code, funcaoName: fe.name, ...measuresOf(agencyFuncao.get(k)!) }
    }),
    agencyGrupo: sortKeys(agencyGrupo).map((k) => {
      const [id, gr] = k.split('|').map(Number)
      const e = entry('orgSup', id)
      const ge = entry('grupo', gr)
      return { orgSup: e.code, name: e.name, grupo: ge.code, grupoName: ge.name, ...measuresOf(agencyGrupo.get(k)!) }
    }),
    totalsMonth: sortKeys(totalsMonth).map((k) => ({ month: Number(k), ...measuresOf(totalsMonth.get(k)!) })),
  }
}

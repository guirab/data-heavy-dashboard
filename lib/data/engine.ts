/**
 * Filter / sort / aggregate over the columnar slice. Pure functions over typed
 * arrays so the same code runs in the worker and in unit tests. The naive
 * baseline (lib/data/naive.ts) deliberately does NOT use this file.
 */
import { DIMENSIONS, MEASURES, type Dictionaries, type Dimension } from '../../types/dataset.ts'
import type { TypedColumn } from './columnar.ts'
import { fold } from './fold.ts'
import type { Query, QueryResult } from '../../types/query.ts'

export type Columns = Record<string, TypedColumn>

/** Dimensions whose names take part in free-text search. */
export const SEARCHABLE: Dimension[] = ['orgSup', 'orgSub', 'programa', 'acao', 'po', 'elemento']

const NM = MEASURES.length
const M = Object.fromEntries(MEASURES.map((m, i) => [m, i])) as Record<(typeof MEASURES)[number], number>

export interface Index {
  /** Folded display name per entry, per searchable dimension. */
  folded: Partial<Record<Dimension, string[]>>
  /** rank[dim][id] = position of the entry in name order, for sorting by a dimension. */
  rank: Record<Dimension, Uint16Array>
}

export function buildIndex(dict: Dictionaries): Index {
  const folded: Index['folded'] = {}
  for (const d of SEARCHABLE) folded[d] = dict[d].map((e) => fold(e.displayName ?? e.name))
  const rank = {} as Record<Dimension, Uint16Array>
  for (const d of DIMENSIONS) {
    const order = dict[d].map((e, id) => ({ id, name: e.displayName ?? e.name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    const r = new Uint16Array(dict[d].length)
    // null entry (id 0) always sorts last
    let pos = 0
    for (const { id } of order) if (id !== 0) r[id] = pos++
    r[0] = pos
    rank[d] = r
  }
  return { folded, rank }
}

/** Per-dimension allow masks (1 = id passes). `null` = dimension unfiltered. */
function buildMasks(q: Query, dict: Dictionaries): Partial<Record<Dimension, Uint8Array>> {
  const masks: Partial<Record<Dimension, Uint8Array>> = {}
  for (const d of DIMENSIONS) {
    const sel = q.filters[d]
    if (sel && sel.length) {
      const m = new Uint8Array(dict[d].length)
      for (const id of sel) if (id < m.length) m[id] = 1
      masks[d] = m
    }
  }
  return masks
}

/** Rows match the search if any searchable dimension's name contains every token. */
function searchMasks(search: string, index: Index): Partial<Record<Dimension, Uint8Array>> | null {
  const tokens = fold(search).split(/\s+/).filter(Boolean)
  if (!tokens.length) return null
  const out: Partial<Record<Dimension, Uint8Array>> = {}
  for (const d of SEARCHABLE) {
    const names = index.folded[d]!
    const m = new Uint8Array(names.length)
    for (let id = 1; id < names.length; id++) {
      const n = names[id]
      let ok = true
      for (const t of tokens) if (!n.includes(t)) { ok = false; break }
      if (ok) m[id] = 1
    }
    out[d] = m
  }
  return out
}

export function runQuery(cols: Columns, dict: Dictionaries, index: Index, q: Query): QueryResult {
  const t0 = performance.now()
  const rows = cols.month.length
  const masks = buildMasks(q, dict)
  const search = searchMasks(q.search, index)
  const [m0, m1] = q.months
  const filtered = DIMENSIONS.filter((d) => masks[d]).map((d) => [cols[d], masks[d]!] as const)
  const searchCols = search ? SEARCHABLE.map((d) => [cols[d], search[d]!] as const) : null
  const orgSup = cols.orgSup
  const month = cols.month

  // 1. filter -> matched ids
  const matched = new Uint32Array(rows)
  let n = 0
  let noAgency = 0
  for (let r = 0; r < rows; r++) {
    const mo = month[r]
    if (mo < m0 || mo > m1) continue
    let ok = true
    for (let i = 0; i < filtered.length; i++) {
      if (!filtered[i][1][filtered[i][0][r]]) { ok = false; break }
    }
    if (!ok) continue
    if (searchCols) {
      let hit = false
      for (let i = 0; i < searchCols.length; i++) {
        if (searchCols[i][1][searchCols[i][0][r]]) { hit = true; break }
      }
      if (!hit) continue
    }
    if (!q.includeNoAgency && orgSup[r] === 0) { noAgency++; continue }
    matched[n++] = r
  }
  const ids = matched.subarray(0, n)

  // 2. aggregate
  const totals = new Float64Array(NM)
  const byAgency = new Float64Array(dict.orgSup.length * NM)
  const byMonth = new Float64Array(12 * NM)
  const measureCols = MEASURES.map((m) => cols[m] as Float64Array)
  for (let i = 0; i < n; i++) {
    const r = ids[i]
    const a = orgSup[r] * NM
    const mo = (month[r] - 1) * NM
    for (let k = 0; k < NM; k++) {
      const v = measureCols[k][r]
      totals[k] += v
      byAgency[a + k] += v
      byMonth[mo + k] += v
    }
  }

  // 3. sort
  const sorted = sortIds(ids, cols, index, q)

  return { ids: sorted, totals, byAgency, byMonth, noAgencyRows: noAgency, engineMs: performance.now() - t0 }
}

/** Sort key per row as a Float64Array so one comparator serves every column. */
function sortKeys(ids: Uint32Array, cols: Columns, index: Index, key: Query['sort']['key']): Float64Array {
  const n = ids.length
  const keys = new Float64Array(n)
  if (key === 'gap') {
    const e = cols.empenhado as Float64Array
    const p = cols.pago as Float64Array
    for (let i = 0; i < n; i++) keys[i] = e[ids[i]] - p[ids[i]]
  } else if (key === 'month' || (MEASURES as readonly string[]).includes(key)) {
    const c = cols[key]
    for (let i = 0; i < n; i++) keys[i] = c[ids[i]]
  } else {
    const c = cols[key]
    const rank = index.rank[key as Dimension]
    for (let i = 0; i < n; i++) keys[i] = rank[c[ids[i]]]
  }
  return keys
}

export function sortIds(ids: Uint32Array, cols: Columns, index: Index, q: Query): Uint32Array {
  const keys = sortKeys(ids, cols, index, q.sort.key)
  const order = new Uint32Array(ids.length)
  for (let i = 0; i < order.length; i++) order[i] = i
  const sign = q.sort.dir === 'asc' ? 1 : -1
  // Tie-break on row index so the order is stable and deterministic.
  order.sort((a, b) => sign * (keys[a] - keys[b]) || a - b)
  const out = new Uint32Array(ids.length)
  for (let i = 0; i < out.length; i++) out[i] = ids[order[i]]
  return out
}

export { M as MEASURE_INDEX }

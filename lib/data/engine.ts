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

export function runQuery(cols: Columns, dict: Dictionaries, index: Index, q: Query, sortStrategy: SortStrategy = 'radix'): QueryResult {
  const t0 = performance.now()
  const rows = cols.month.length
  const masks = buildMasks(q, dict)
  const search = searchMasks(q.search, index)
  const [m0, m1] = q.months
  // The agency filter is applied last so the ranking can be aggregated *before* it:
  // selected agencies are emphasised against the others, not shown alone.
  const filtered = DIMENSIONS.filter((d) => d !== 'orgSup' && masks[d]).map((d) => [cols[d], masks[d]!] as const)
  const agencyMask = masks.orgSup ?? null
  const searchCols = search ? SEARCHABLE.map((d) => [cols[d], search[d]!] as const) : null
  const orgSup = cols.orgSup
  const month = cols.month
  const measureCols = MEASURES.map((m) => cols[m] as Float64Array)

  // 1. filter -> matched ids, aggregating as we go
  const matched = new Uint32Array(rows)
  let n = 0
  let noAgency = 0
  const totals = new Float64Array(NM)
  const byAgency = new Float64Array(dict.orgSup.length * NM)
  const byMonth = new Float64Array(12 * NM)
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
    const agency = orgSup[r]
    if (!q.includeNoAgency && agency === 0) { noAgency++; continue }
    const a = agency * NM
    for (let k = 0; k < NM; k++) byAgency[a + k] += measureCols[k][r]
    if (agencyMask && !agencyMask[agency]) continue
    matched[n++] = r
    const mb = (mo - 1) * NM
    for (let k = 0; k < NM; k++) {
      const v = measureCols[k][r]
      totals[k] += v
      byMonth[mb + k] += v
    }
  }
  const ids = matched.subarray(0, n)

  // 3. sort
  const sorted = sortIds(ids, cols, index, q, sortStrategy)

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

/**
 * LSD radix sort over integer keys (centavos, ranks, months are all integers).
 * Stable, O(passes × n) with 16-bit digits; replaces the comparator sort whose
 * per-element callback dominated the engine time (see docs/perf.md).
 */
export function radixSortIndices(keys: Float64Array, desc: boolean): Uint32Array {
  const n = keys.length
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < n; i++) {
    const k = keys[i]
    if (k < min) min = k
    if (k > max) max = k
  }
  if (n === 0 || min === max) {
    const id = new Uint32Array(n)
    for (let i = 0; i < n; i++) id[i] = i
    return id
  }
  // Shift to non-negative; descending order = ascending order of (max - key), which
  // keeps ties in original (row) order in both directions.
  const shifted = new Float64Array(n)
  for (let i = 0; i < n; i++) shifted[i] = desc ? max - keys[i] : keys[i] - min
  const range = max - min
  const passes = Math.max(1, Math.ceil(Math.log2(range + 1) / 16))
  let src = new Uint32Array(n)
  let dst = new Uint32Array(n)
  for (let i = 0; i < n; i++) src[i] = i
  const counts = new Uint32Array(65537)
  let divisor = 1
  for (let p = 0; p < passes; p++) {
    counts.fill(0)
    for (let i = 0; i < n; i++) counts[(Math.floor(shifted[src[i]] / divisor) % 65536) + 1]++
    for (let d = 0; d < 65536; d++) counts[d + 1] += counts[d]
    for (let i = 0; i < n; i++) {
      const idx = src[i]
      dst[counts[Math.floor(shifted[idx] / divisor) % 65536]++] = idx
    }
    const t = src
    src = dst
    dst = t
    divisor *= 65536
  }
  return src
}

export type SortStrategy = 'radix' | 'comparator'

export function sortIds(ids: Uint32Array, cols: Columns, index: Index, q: Query, strategy: SortStrategy = 'radix'): Uint32Array {
  const keys = sortKeys(ids, cols, index, q.sort.key)
  let order: Uint32Array
  if (strategy === 'radix') {
    order = radixSortIndices(keys, q.sort.dir === 'desc')
  } else {
    order = new Uint32Array(ids.length)
    for (let i = 0; i < order.length; i++) order[i] = i
    const sign = q.sort.dir === 'asc' ? 1 : -1
    // Tie-break on row index so the order is stable and deterministic.
    order.sort((a, b) => sign * (keys[a] - keys[b]) || a - b)
  }
  const out = new Uint32Array(ids.length)
  for (let i = 0; i < out.length; i++) out[i] = ids[order[i]]
  return out
}

export { M as MEASURE_INDEX }

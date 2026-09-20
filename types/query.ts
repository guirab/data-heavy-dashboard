import { DIMENSIONS, MEASURES, type Dimension, type Measure } from './dataset.ts'

export type SortKey = Dimension | Measure | 'gap' | 'month'
/** Every key the engine can sort by; the URL parser validates against this list. */
export const SORT_KEYS: readonly SortKey[] = [...DIMENSIONS, ...MEASURES, 'gap', 'month']
export const isSortKey = (s: string): s is SortKey => (SORT_KEYS as readonly string[]).includes(s)

export interface Query {
  /** Selected dictionary ids per dimension; absent or empty = no filter. */
  filters: Partial<Record<Dimension, number[]>>
  /** Inclusive month range, 1-based. */
  months: [number, number]
  /** Free text; accent- and case-insensitive match over the searchable dimensions' names. */
  search: string
  /** Rows normalized to a null agency (DEF-05) are excluded from rankings by default. */
  includeNoAgency: boolean
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  /** Engine sort implementation; 'comparator' exists only for the before/after measurement. */
  sortStrategy?: 'radix' | 'comparator'
}

export const DEFAULT_QUERY: Query = {
  filters: {},
  months: [1, 12],
  search: '',
  includeNoAgency: false,
  sort: { key: 'gap', dir: 'desc' },
}

export interface QueryResult {
  /** Rows matching the query, in sort order (indexes into the columnar slice). */
  ids: Uint32Array
  /** Six measures summed over the matched rows. */
  totals: Float64Array
  /** Measures per órgão superior id, over rows matching every filter EXCEPT the agency filter
   * (so a selected agency is ranked against the others): byAgency[id * 6 + measure]. */
  byAgency: Float64Array
  /** Measures per month (1..12 → index 0..11): byMonth[(m - 1) * 6 + measure]. */
  byMonth: Float64Array
  /** Rows that were excluded only because they have no agency (partial-data state). */
  noAgencyRows: number
  /** Milliseconds spent inside the engine (filter + sort + aggregate). */
  engineMs: number
}

export type LoadPhase = 'manifest' | 'dictionary' | 'columns' | 'verify' | 'inflate' | 'decode' | 'index'

export interface LoadProgress {
  phase: LoadPhase
  /** Bytes received so far for the columns file. */
  loaded: number
  total: number
}

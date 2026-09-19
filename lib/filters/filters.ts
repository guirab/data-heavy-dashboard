/**
 * Filter state lives in the URL so any view is shareable and reload-safe.
 * Dimensions are stored as source codes (stable across years); ids are
 * resolved against the loaded year's dictionary when the query is built.
 */
import { DIMENSIONS, type Dictionaries, type Dimension } from '../../types/dataset.ts'
import { DEFAULT_QUERY, type Query, type SortKey } from '../../types/query.ts'

export const FILTERABLE: Dimension[] = ['orgSup', 'funcao', 'grupo', 'modalidade', 'uf']

export interface FilterState {
  year: number
  /** Selected source codes per dimension. */
  codes: Partial<Record<Dimension, string[]>>
  months: [number, number]
  search: string
  includeNoAgency: boolean
  sort: { key: SortKey; dir: 'asc' | 'desc' }
}

export const defaultFilters = (year: number): FilterState => ({
  year,
  codes: {},
  months: [1, 12],
  search: '',
  includeNoAgency: false,
  sort: { ...DEFAULT_QUERY.sort },
})

const PARAM: Record<Dimension, string> = {
  orgSup: 'org',
  orgSub: 'sub',
  funcao: 'funcao',
  subfuncao: 'subfuncao',
  programa: 'programa',
  acao: 'acao',
  po: 'po',
  grupo: 'grupo',
  elemento: 'elemento',
  modalidade: 'mod',
  uf: 'uf',
}

export function parseFilters(search: string, fallbackYear: number, years: number[]): FilterState {
  const p = new URLSearchParams(search)
  const year = Number(p.get('year'))
  const f = defaultFilters(years.includes(year) ? year : fallbackYear)
  for (const d of DIMENSIONS) {
    const v = p.get(PARAM[d])
    if (v) f.codes[d] = v.split(',').filter(Boolean)
  }
  const m = p.get('months')?.match(/^(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const a = Math.min(12, Math.max(1, Number(m[1])))
    const b = Math.min(12, Math.max(1, Number(m[2])))
    f.months = a <= b ? [a, b] : [b, a]
  }
  f.search = p.get('q') ?? ''
  f.includeNoAgency = p.get('noagency') === '1'
  const s = p.get('sort')?.match(/^([a-zA-Z]+):(asc|desc)$/)
  if (s) f.sort = { key: s[1] as SortKey, dir: s[2] as 'asc' | 'desc' }
  return f
}

export function serializeFilters(f: FilterState, defaultYear: number): string {
  const p = new URLSearchParams()
  if (f.year !== defaultYear) p.set('year', String(f.year))
  for (const d of DIMENSIONS) {
    const codes = f.codes[d]
    if (codes?.length) p.set(PARAM[d], codes.join(','))
  }
  if (f.months[0] !== 1 || f.months[1] !== 12) p.set('months', `${f.months[0]}-${f.months[1]}`)
  if (f.search) p.set('q', f.search)
  if (f.includeNoAgency) p.set('noagency', '1')
  if (f.sort.key !== DEFAULT_QUERY.sort.key || f.sort.dir !== DEFAULT_QUERY.sort.dir) p.set('sort', `${f.sort.key}:${f.sort.dir}`)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Resolve codes to this year's dictionary ids. Codes unknown to the year are dropped (not an error). */
export function toQuery(f: FilterState, dict: Dictionaries): Query {
  const filters: Query['filters'] = {}
  for (const d of DIMENSIONS) {
    const codes = f.codes[d]
    if (!codes?.length) continue
    const ids = codes.map((c) => dict[d].findIndex((e) => e.code === c)).filter((i) => i > 0)
    // A filter whose codes all vanished in this year must still filter (to nothing), not silently widen.
    filters[d] = ids.length ? ids : [-1]
  }
  return { filters, months: f.months, search: f.search, includeNoAgency: f.includeNoAgency, sort: f.sort }
}

export type FilterAction =
  | { type: 'year'; year: number }
  | { type: 'toggleCode'; dim: Dimension; code: string }
  | { type: 'setCodes'; dim: Dimension; codes: string[] }
  | { type: 'months'; months: [number, number] }
  | { type: 'search'; search: string }
  | { type: 'includeNoAgency'; value: boolean }
  | { type: 'sort'; key: SortKey }
  | { type: 'clearLast' }
  | { type: 'clearAll' }
  | { type: 'replace'; state: FilterState }

export function filtersReducer(s: FilterState, a: FilterAction): FilterState {
  switch (a.type) {
    case 'year':
      return { ...s, year: a.year }
    case 'toggleCode': {
      const cur = s.codes[a.dim] ?? []
      const next = cur.includes(a.code) ? cur.filter((c) => c !== a.code) : [...cur, a.code]
      return { ...s, codes: { ...s.codes, [a.dim]: next } }
    }
    case 'setCodes':
      return { ...s, codes: { ...s.codes, [a.dim]: a.codes } }
    case 'months':
      return { ...s, months: a.months }
    case 'search':
      return { ...s, search: a.search }
    case 'includeNoAgency':
      return { ...s, includeNoAgency: a.value }
    case 'sort':
      return { ...s, sort: s.sort.key === a.key ? { key: a.key, dir: s.sort.dir === 'desc' ? 'asc' : 'desc' } : { key: a.key, dir: a.key === 'gap' || (a.key as string).startsWith('rp') || ['empenhado', 'liquidado', 'pago'].includes(a.key) ? 'desc' : 'asc' } }
    case 'clearLast': {
      // Undo the most specific thing first: search, then the last dimension with a selection, then months.
      if (s.search) return { ...s, search: '' }
      const dims = DIMENSIONS.filter((d) => s.codes[d]?.length)
      if (dims.length) return { ...s, codes: { ...s.codes, [dims[dims.length - 1]]: [] } }
      if (s.months[0] !== 1 || s.months[1] !== 12) return { ...s, months: [1, 12] }
      return s
    }
    case 'clearAll':
      return { ...defaultFilters(s.year), sort: s.sort }
    case 'replace':
      return a.state
  }
}

/** Human-readable chips for the active filters (used by the empty-filter state and the filter bar). */
export function activeChips(f: FilterState, dict: Dictionaries | null): Array<{ dim: Dimension | 'months' | 'search'; label: string; code?: string }> {
  const chips: Array<{ dim: Dimension | 'months' | 'search'; label: string; code?: string }> = []
  for (const d of DIMENSIONS) {
    for (const code of f.codes[d] ?? []) {
      const e = dict?.[d].find((x) => x.code === code)
      chips.push({ dim: d, code, label: e ? e.displayName ?? e.name : code })
    }
  }
  if (f.months[0] !== 1 || f.months[1] !== 12) chips.push({ dim: 'months', label: `months ${f.months[0]}–${f.months[1]}` })
  if (f.search) chips.push({ dim: 'search', label: `“${f.search}”` })
  return chips
}

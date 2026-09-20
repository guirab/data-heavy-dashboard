import { describe, expect, it } from 'vitest'
import { defaultFilters, filtersReducer, parseFilters, serializeFilters, toQuery } from './filters'
import type { Dictionaries } from '@/types/dataset'
import { DIMENSIONS } from '@/types/dataset'

const years = [2024, 2025, 2026]

describe('filters <-> URL', () => {
  it('round-trips every field and omits defaults', () => {
    const f = defaultFilters(2025)
    expect(serializeFilters(f, 2025)).toBe('')
    const full = { ...f, year: 2024, codes: { orgSup: ['26000', '52000'], grupo: ['4'] }, months: [3, 9] as [number, number], search: 'univ', includeNoAgency: true, sort: { key: 'pago' as const, dir: 'asc' as const } }
    const url = serializeFilters(full, 2025)
    expect(url).toBe('?year=2024&org=26000%2C52000&grupo=4&months=3-9&q=univ&noagency=1&sort=pago%3Aasc')
    expect(parseFilters(url, 2025, years)).toEqual(full)
  })
  it('falls back on garbage', () => {
    const f = parseFilters('?year=1999&months=13-0&sort=nope', 2025, years)
    expect(f.year).toBe(2025)
    expect(f.months).toEqual([1, 12])
    expect(f.sort.key).toBe('gap')
  })
  it('only accepts sort keys the engine knows (a well-formed unknown key used to crash the worker)', () => {
    expect(parseFilters('?sort=nope:asc', 2025, years).sort).toEqual({ key: 'gap', dir: 'desc' })
    expect(parseFilters('?sort=pago:sideways', 2025, years).sort).toEqual({ key: 'gap', dir: 'desc' })
    expect(parseFilters('?sort=__proto__:asc', 2025, years).sort).toEqual({ key: 'gap', dir: 'desc' })
    // Measures outside the table columns are still valid engine keys.
    expect(parseFilters('?sort=rpInscritos:asc', 2025, years).sort).toEqual({ key: 'rpInscritos', dir: 'asc' })
    expect(parseFilters('?sort=uf:desc', 2025, years).sort).toEqual({ key: 'uf', dir: 'desc' })
  })
})

describe('reducer', () => {
  it('toggles codes and clears the most specific filter first', () => {
    let s = defaultFilters(2025)
    s = filtersReducer(s, { type: 'toggleCode', dim: 'orgSup', code: '26000' })
    s = filtersReducer(s, { type: 'search', search: 'x' })
    s = filtersReducer(s, { type: 'clearLast' })
    expect(s.search).toBe('')
    expect(s.codes.orgSup).toEqual(['26000'])
    s = filtersReducer(s, { type: 'clearLast' })
    expect(s.codes.orgSup).toEqual([])
  })
  it('flips direction when sorting the same key twice', () => {
    let s = defaultFilters(2025)
    s = filtersReducer(s, { type: 'sort', key: 'gap' })
    expect(s.sort.dir).toBe('asc')
    s = filtersReducer(s, { type: 'sort', key: 'orgSup' })
    expect(s.sort).toEqual({ key: 'orgSup', dir: 'asc' })
  })
})

describe('toQuery', () => {
  const dict = Object.fromEntries(DIMENSIONS.map((d) => [d, [{ code: null, name: '' }]])) as Dictionaries
  dict.orgSup = [{ code: null, name: '' }, { code: '26000', name: 'MEC' }]
  it('maps codes to ids and keeps an impossible filter impossible', () => {
    const f = { ...defaultFilters(2025), codes: { orgSup: ['26000'], grupo: ['9'] } }
    const q = toQuery(f, dict)
    expect(q.filters.orgSup).toEqual([1])
    expect(q.filters.grupo).toEqual([-1])
  })
})

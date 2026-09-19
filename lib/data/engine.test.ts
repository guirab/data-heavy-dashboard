import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { DIMENSIONS, MEASURES, type Dictionaries, type YearManifest } from '@/types/dataset'
import { DEFAULT_QUERY, type Query } from '@/types/query'
import { decodeColumns } from './columnar'
import { buildIndex, radixSortIndices, runQuery, sortIds, type Columns } from './engine'

// --- tiny synthetic slice -------------------------------------------------
const dict: Dictionaries = Object.fromEntries(DIMENSIONS.map((d) => [d, [{ code: null, name: '' }]])) as Dictionaries
dict.orgSup = [{ code: null, name: '' }, { code: '26000', name: 'Ministério da Educação' }, { code: '52000', name: 'Ministério da Defesa' }]
dict.acao = [{ code: null, name: '' }, { code: '2004', name: 'ASSISTENCIA MEDICA' }, { code: '20RK', name: 'FUNCIONAMENTO DE INSTITUICOES' }]
dict.funcao = [{ code: null, name: '' }, { code: '12', name: 'Educação' }, { code: '05', name: 'Defesa nacional' }]

const rows = [
  // orgSup, acao, funcao, month, empenhado, pago
  [1, 2, 1, 1, 1000, 400],
  [1, 1, 1, 2, 500, 500],
  [2, 1, 2, 1, 800, 100],
  [2, 2, 2, 3, -50, 0],
  [0, 1, 1, 1, 70, 0], // no agency
]
const cols: Columns = {
  month: Uint8Array.from(rows.map((r) => r[3])),
  orgSup: Uint8Array.from(rows.map((r) => r[0])),
  acao: Uint8Array.from(rows.map((r) => r[1])),
  funcao: Uint8Array.from(rows.map((r) => r[2])),
  empenhado: Float64Array.from(rows.map((r) => r[4])),
  pago: Float64Array.from(rows.map((r) => r[5])),
}
for (const d of DIMENSIONS) cols[d] ??= new Uint8Array(rows.length)
for (const m of MEASURES) cols[m] ??= new Float64Array(rows.length)
const index = buildIndex(dict)
const q = (over: Partial<Query>): Query => ({ ...DEFAULT_QUERY, ...over })

describe('radix sort', () => {
  it('matches the comparator sort, including ties and negatives, in both directions', () => {
    const keys = Float64Array.from([5, -3, 5, 0, 1e14, -3, 7, 0])
    const asc = Array.from(radixSortIndices(keys, false))
    const desc = Array.from(radixSortIndices(keys, true))
    const cmpAsc = Array.from(keys.keys()).sort((a, b) => keys[a] - keys[b] || a - b)
    const cmpDesc = Array.from(keys.keys()).sort((a, b) => keys[b] - keys[a] || a - b)
    expect(asc).toEqual(cmpAsc)
    expect(desc).toEqual(cmpDesc)
  })
  it('handles empty and constant inputs', () => {
    expect(Array.from(radixSortIndices(new Float64Array(0), false))).toEqual([])
    expect(Array.from(radixSortIndices(Float64Array.from([2, 2, 2]), true))).toEqual([0, 1, 2])
  })
})

describe('engine on a synthetic slice', () => {
  it('excludes no-agency rows by default and counts them', () => {
    const r = runQuery(cols, dict, index, q({}))
    expect(r.ids.length).toBe(4)
    expect(r.noAgencyRows).toBe(1)
    expect(runQuery(cols, dict, index, q({ includeNoAgency: true })).ids.length).toBe(5)
  })
  it('sorts by gap desc with a stable tie-break', () => {
    const r = runQuery(cols, dict, index, q({}))
    expect(Array.from(r.ids)).toEqual([2, 0, 1, 3]) // gaps 700, 600, 0, -50
  })
  it('ranks agencies against each other even when one is selected', () => {
    const r = runQuery(cols, dict, index, q({ filters: { orgSup: [2] } }))
    expect(r.ids.length).toBe(2)
    expect(r.totals[0]).toBe(750) // only Defesa in totals
    expect(r.byAgency[1 * 6 + 0]).toBe(1500) // Educação still ranked
    expect(r.byAgency[2 * 6 + 0]).toBe(750)
  })
  it('filters by dimension, month range and search (accent-insensitive)', () => {
    expect(runQuery(cols, dict, index, q({ filters: { orgSup: [2] } })).ids.length).toBe(2)
    expect(runQuery(cols, dict, index, q({ months: [2, 3] })).ids.length).toBe(2)
    expect(runQuery(cols, dict, index, q({ search: 'educacao' })).ids.length).toBe(2)
    expect(runQuery(cols, dict, index, q({ search: 'assistencia medica' })).ids.length).toBe(2)
    expect(runQuery(cols, dict, index, q({ search: 'nada' })).ids.length).toBe(0)
  })
  it('aggregates totals, by agency and by month', () => {
    const r = runQuery(cols, dict, index, q({}))
    expect(r.totals[0]).toBe(2250)
    expect(r.byAgency[1 * 6 + 0]).toBe(1500)
    expect(r.byAgency[2 * 6 + 2]).toBe(100)
    expect(r.byMonth[0 * 6 + 0]).toBe(1800)
  })
  it('sorts by a dimension using name order, null last', () => {
    const r = runQuery(cols, dict, index, q({ includeNoAgency: true, sort: { key: 'orgSup', dir: 'asc' } }))
    expect(Array.from(cols.orgSup).filter((_, i) => r.ids.includes(i)).length).toBe(5)
    expect(r.ids[4]).toBe(4) // the no-agency row sorts last
    expect(cols.orgSup[r.ids[0]]).toBe(2) // "Defesa" < "Educação"
  })
})

// --- the real 2025 slice, if the artifacts exist ---------------------------
const dir = path.resolve(import.meta.dirname, '../../public/data/v1/2025')
const has = fs.existsSync(path.join(dir, 'columns.bin.gz'))

describe.skipIf(!has)('engine on the real FY2025 slice', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as YearManifest
  const real = JSON.parse(fs.readFileSync(path.join(dir, 'dict.json'), 'utf8')) as Dictionaries
  const buf = gunzipSync(fs.readFileSync(path.join(dir, 'columns.bin.gz')))
  const realCols = decodeColumns(manifest.columnar, new Uint8Array(buf)) as Columns
  const realIndex = buildIndex(real)
  const agencyMonth = JSON.parse(fs.readFileSync(path.join(dir, 'agg', 'agency-month.json'), 'utf8')) as Array<Record<string, number | string | null>>

  it('reproduces the pipeline pre-aggregates from the slice', () => {
    const r = runQuery(realCols, real, realIndex, q({ includeNoAgency: true }))
    expect(r.ids.length).toBe(manifest.rows)
    const expected = agencyMonth.reduce((s, a) => s + (a.empenhado as number), 0)
    expect(r.totals[0]).toBe(expected)
    const mec = real.orgSup.findIndex((e) => e.code === '26000')
    const mecExpected = agencyMonth.filter((a) => a.orgSup === '26000').reduce((s, a) => s + (a.pago as number), 0)
    expect(r.byAgency[mec * 6 + 2]).toBe(mecExpected)
  })
  it('radix and comparator sorts agree on the real slice', () => {
    const base = runQuery(realCols, real, realIndex, q({ includeNoAgency: true, search: 'saude' }))
    for (const key of ['pago', 'gap', 'acao', 'month'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        const query = q({ sort: { key, dir } })
        const a = sortIds(base.ids, realCols, realIndex, query, 'radix')
        const b = sortIds(base.ids, realCols, realIndex, query, 'comparator')
        expect(a.length).toBe(b.length)
        expect(a.every((v, i) => v === b[i])).toBe(true)
      }
    }
  })
  it(`filters, sorts and aggregates ${manifest.rows.toLocaleString()} rows well under the 200ms budget in Node`, () => {
    const r = runQuery(realCols, real, realIndex, q({ search: 'universidade', sort: { key: 'pago', dir: 'desc' } }))
    expect(r.ids.length).toBeGreaterThan(1000)
    expect(r.engineMs).toBeLessThan(200)
  })
})

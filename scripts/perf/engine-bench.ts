/** Quick engine timing in Node over the real slice (browser numbers come from scripts/perf/measure.ts). */
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { decodeColumns } from '../../lib/data/columnar.ts'
import { buildIndex, runQuery, type Columns } from '../../lib/data/engine.ts'
import { DEFAULT_QUERY } from '../../types/query.ts'
import type { Dictionaries, YearManifest } from '../../types/dataset.ts'

const dir = path.resolve(import.meta.dirname, '../../public/data/v1', process.argv[2] ?? '2025')
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as YearManifest
const dict = JSON.parse(fs.readFileSync(path.join(dir, 'dict.json'), 'utf8')) as Dictionaries
let t = performance.now()
const cols = decodeColumns(manifest.columnar, new Uint8Array(gunzipSync(fs.readFileSync(path.join(dir, 'columns.bin.gz'))))) as Columns
console.log(`inflate+decode ${(performance.now() - t).toFixed(0)}ms, ${manifest.rows.toLocaleString()} rows`)
t = performance.now()
const index = buildIndex(dict)
console.log(`index ${(performance.now() - t).toFixed(0)}ms`)
const cases = [
  ['default (gap desc)', {}],
  ['sort by pago', { sort: { key: 'pago', dir: 'desc' } }],
  ['sort by acao name', { sort: { key: 'acao', dir: 'asc' } }],
  ['filter MEC', { filters: { orgSup: [dict.orgSup.findIndex((e) => e.code === '26000')] } }],
  ['search universidade', { search: 'universidade' }],
  ['months 6-9 + grupo 4', { months: [6, 9], filters: { grupo: [dict.grupo.findIndex((e) => e.code === '4')] } }],
] as const
for (const strategy of ['comparator', 'radix'] as const) {
  console.log(`\nsort strategy: ${strategy}`)
  for (const [label, over] of cases) {
    const times: number[] = []
    let n = 0
    for (let i = 0; i < 7; i++) {
      const r = runQuery(cols, dict, index, { ...DEFAULT_QUERY, ...over } as never, strategy)
      times.push(r.engineMs)
      n = r.ids.length
    }
    times.sort((a, b) => a - b)
    console.log(`${label.padEnd(24)} rows=${n.toString().padStart(7)}  median ${times[3].toFixed(1)}ms  min ${times[0].toFixed(1)}ms`)
  }
}

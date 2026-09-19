import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { encodeColumns, unsignedTypeFor, type ColumnInput } from '../../lib/data/columnar.ts'
import { DIMENSIONS, MEASURES, type Dictionaries, type YearManifest } from '../../types/dataset.ts'
import type { Grouped } from './03-aggregate.ts'
import { OUT_DIR } from './config.ts'

/** Stable JSON: sorted keys at every level, so re-runs are byte-identical. */
export function stableJson(value: unknown, pretty = false): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      )
    }
    return v
  }
  return JSON.stringify(sort(value), null, pretty ? 2 : undefined) + '\n'
}

export function writeJson(file: string, value: unknown, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, stableJson(value, pretty))
}

export function emitYear(
  year: number,
  months: number[],
  grouped: Grouped,
  dict: Dictionaries,
  aggs: Record<string, unknown[]>,
  rawRows: number,
  sourceLastModified: string | null,
) {
  const dir = path.join(OUT_DIR, String(year))
  fs.mkdirSync(path.join(dir, 'agg'), { recursive: true })

  const columns: ColumnInput[] = [{ name: 'month', type: 'u8', data: grouped.month }]
  DIMENSIONS.forEach((d, i) => {
    const type = unsignedTypeFor(dict[d].length - 1)
    const src = grouped.dims[i]
    const data = type === 'u8' ? Uint8Array.from(src) : type === 'u16' ? Uint16Array.from(src) : src
    columns.push({ name: d, type, data })
  })
  MEASURES.forEach((m, i) => columns.push({ name: m, type: 'f64', data: grouped.values[i] }))

  const { manifest, buffer } = encodeColumns(columns)
  // gzip with a fixed mtime (0) so identical input yields identical bytes.
  const gz = gzipSync(buffer, { level: 9 })
  gz.writeUInt32LE(0, 4)
  fs.writeFileSync(path.join(dir, 'columns.bin.gz'), gz)

  const yearManifest: YearManifest = {
    year,
    months,
    partial: months.length < 12,
    rows: grouped.rows,
    rawRows,
    columnar: manifest,
    columnsGzipBytes: gz.byteLength,
    sourceLastModified,
    columnsSha256: createHash('sha256').update(gz).digest('hex'),
  }
  writeJson(path.join(dir, 'manifest.json'), yearManifest, true)
  writeJson(path.join(dir, 'dict.json'), dict)
  for (const [name, rows] of Object.entries(aggs)) writeJson(path.join(dir, 'agg', `${kebab(name)}.json`), rows)
  return { rawBytes: buffer.byteLength, gzipBytes: gz.byteLength }
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

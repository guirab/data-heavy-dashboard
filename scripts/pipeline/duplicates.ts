/**
 * Duplicate detection (DEF-19). Two questions a reviewer asks about any grouped
 * dataset: are there exact duplicate rows, and are there rows that share every
 * dimension (so grouping would silently add them together)? Both are counted
 * per year over the raw rows, with a SHA-1 of the joined fields as the key.
 */
import { createHash } from 'node:crypto'
import type { DefectsRegistry } from './defects.ts'
import { VALUE_COLS, type Row } from './schema.ts'

export const DEF19 = {
  id: 'DEF-19',
  title: 'Duplicate rows',
  problem: 'A monthly file could repeat a line (exact duplicate) or publish two lines with identical classification and different amounts (duplicate key), and grouping would sum them silently.',
  rule: 'Every raw row is hashed twice — all 47 fields, and the 41 dimension fields — and repeats are counted per year. The count is reported even when it is zero, because "we checked" is the point.',
  action: 'document' as const,
  columns: ['all columns', 'all dimension columns'],
}

const VALUE_SET = new Set<number>(VALUE_COLS)

export class DuplicateDetector {
  private exact = new Set<string>()
  private keys = new Set<string>()
  exactDuplicates = 0
  keyDuplicates = 0

  readonly year: number

  constructor(year: number) {
    this.year = year
  }

  /** Call on the raw row before any rule mutates it. */
  add(row: Row) {
    const all = createHash('sha1').update(row.f.join('\u0001')).digest('base64')
    if (this.exact.has(all)) this.exactDuplicates++
    else this.exact.add(all)
    const dims = createHash('sha1')
    for (let i = 0; i < row.f.length; i++) if (!VALUE_SET.has(i)) dims.update(row.f[i]).update('\u0001')
    const key = dims.digest('base64')
    if (this.keys.has(key)) this.keyDuplicates++
    else this.keys.add(key)
  }

  report(reg: DefectsRegistry) {
    reg.addRows('DEF-19', this.year, this.keyDuplicates)
    reg.note('DEF-19', `${this.year}: ${this.exactDuplicates} exact duplicate rows, ${this.keyDuplicates} rows sharing all dimensions with another row, over ${this.exact.size.toLocaleString('en-US')} distinct rows`)
    if (this.keyDuplicates > 0) reg.hitColumn('DEF-19', 'all dimension columns')
    if (this.exactDuplicates > 0) reg.hitColumn('DEF-19', 'all columns')
    this.exact.clear()
    this.keys.clear()
  }
}

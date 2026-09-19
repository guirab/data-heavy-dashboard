import { C, VALUE_COLS, name } from '../schema.ts'
import type { RowRule } from './types.ts'

const MONEY = /^(-?)(\d+),(\d{2})$/

/** "13404423,26" -> 1340442326 (integer centavos). Throws on anything else: a silent NaN is worse than a crash. */
export function parseCentavos(s: string): number {
  const m = MONEY.exec(s)
  if (!m) throw new Error(`money column does not match -?\\d+,\\d{2}: "${s}"`)
  const n = Number(m[2]) * 100 + Number(m[3])
  return m[1] ? -n : n
}

export const DEF03: RowRule = {
  def: {
    id: 'DEF-03',
    title: 'Money stored as text with a decimal comma',
    problem: 'All six value columns are strings like "13404423,26"; there is no thousands separator, but the decimal separator is a comma.',
    rule: 'Parse with a strict regex into integer centavos (exact in a Float64 below 2^53). Any value that does not match the regex aborts the run instead of becoming NaN.',
    action: 'transform',
    columns: VALUE_COLS.map(name),
  },
  apply(row, reg) {
    VALUE_COLS.forEach((c, i) => {
      const raw = row.f[c]
      row.v[i] = parseCentavos(raw)
      if (i === 0) reg.hitColumn('DEF-03', name(c), { before: raw, after: String(row.v[i]), period: row.period })
      else reg.hitColumn('DEF-03', name(c))
    })
    reg.hitRow('DEF-03', row.year)
    return 'keep'
  },
}

export { C }

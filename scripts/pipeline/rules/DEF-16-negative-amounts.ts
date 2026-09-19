import { VALUE_COLS, name } from '../schema.ts'
import type { RowRule } from './types.ts'

export const DEF16: RowRule = {
  def: {
    id: 'DEF-16',
    title: 'Negative amounts',
    problem: 'Committed, verified and paid amounts can be negative in a month: they are reversals (estornos) of earlier commitments, not errors.',
    rule: 'Kept as-is. Dropping or clamping them would overstate execution; the UI shows the sign and monthly cumulative series absorb them.',
    action: 'keep',
    columns: VALUE_COLS.map(name),
  },
  apply(row, reg) {
    let hit = false
    for (let i = 0; i < 6; i++) {
      if (row.v[i] < 0) {
        hit = true
        reg.hitColumn('DEF-16', name(VALUE_COLS[i]), { before: row.f[VALUE_COLS[i]], after: null, period: row.period })
      }
    }
    if (hit) reg.hitRow('DEF-16', row.year)
    return 'keep'
  },
}

import { NAME_COLS, name } from '../schema.ts'
import type { RowRule } from './types.ts'

const RUNS = /\s{2,}/g

export const DEF08: RowRule = {
  def: {
    id: 'DEF-08',
    title: 'Runs of internal spaces (fixed-width remnants)',
    problem: 'Names like "ADMINISTRACAO DA UNIDADE       - NACIONAL" keep padding from a fixed-width upstream system.',
    rule: 'Collapse any run of two or more whitespace characters to a single space.',
    action: 'transform',
    columns: ['all name columns'],
  },
  apply(row, reg) {
    let hit = false
    for (const c of NAME_COLS) {
      const s = row.f[c]
      if (RUNS.test(s)) {
        RUNS.lastIndex = 0
        const t = s.replace(RUNS, ' ')
        row.f[c] = t
        hit = true
        reg.hitColumn('DEF-08', name(c), { before: s, after: t, period: row.period })
      }
      RUNS.lastIndex = 0
    }
    if (hit) reg.hitRow('DEF-08', row.year)
    return 'keep'
  },
}

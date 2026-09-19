import { NAME_COLS, name } from '../schema.ts'
import type { RowRule } from './types.ts'

export const DEF09: RowRule = {
  def: {
    id: 'DEF-09',
    title: 'Leading/trailing whitespace in names',
    problem: 'Some names carry trailing spaces (e.g. "ADMINISTRACAO DA UNIDADE - NO ESTADO DO "), which makes the same value look like two distinct categories.',
    rule: 'Trim every name column. Applied before dictionary building so keys never differ only by whitespace.',
    action: 'transform',
    columns: ['all name columns'],
  },
  apply(row, reg) {
    let hit = false
    for (const c of NAME_COLS) {
      const s = row.f[c]
      const t = s.trim()
      if (t !== s) {
        row.f[c] = t
        hit = true
        reg.hitColumn('DEF-09', name(c), { before: JSON.stringify(s), after: JSON.stringify(t), period: row.period })
      }
    }
    if (hit) reg.hitRow('DEF-09', row.year)
    return 'keep'
  },
}

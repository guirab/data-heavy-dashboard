import { NAME_COLS, name } from '../schema.ts'
import type { RowRule } from './types.ts'

export const DEF11: RowRule = {
  def: {
    id: 'DEF-11',
    title: '"§" mangled to "??" upstream',
    problem: 'Legal references like "§§ 1º e 2º" arrive as "?? 1º e 2º": the section sign was lost before the file was exported (the file itself decodes cleanly as ISO-8859-1).',
    rule: 'Left alone. Guessing the original character would be inventing data; the count documents the loss.',
    action: 'keep',
    columns: ['Plano Orçamentário', 'Nome Ação', 'Modalidade da Despesa'],
  },
  apply(row, reg) {
    let hit = false
    for (const c of NAME_COLS) {
      const s = row.f[c]
      if (s.includes('??')) {
        hit = true
        reg.hitColumn('DEF-11', name(c), { before: s.slice(0, 80), after: null, period: row.period })
      }
    }
    if (hit) reg.hitRow('DEF-11', row.year)
    return 'keep'
  },
}

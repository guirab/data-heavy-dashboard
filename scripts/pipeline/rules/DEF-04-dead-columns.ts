import { C, name } from '../schema.ts'
import type { RowRule } from './types.ts'

/** Columns that carry the same placeholder in every row of every file seen. */
const DEAD: Array<{ col: number; constant: string }> = [
  { col: C.progGovName, constant: 'Sem informação' },
  { col: C.localizadorSigla, constant: '-1' },
  { col: C.localizadorDescr, constant: 'Sem informação' },
]

export const DEF04: RowRule = {
  def: {
    id: 'DEF-04',
    title: 'Dead columns',
    problem: '"Nome Programa Governo", "Sigla Localizador" and "Descrição Complementar Localizador" hold the same placeholder in 100% of rows: the schema promises data the export never fills.',
    rule: 'Dropped from the served data. The rule counts rows where the placeholder holds, so a future file that starts filling the column shows up as a count below 100%.',
    action: 'drop-column',
    columns: DEAD.map((d) => name(d.col)),
  },
  apply(row, reg) {
    let all = true
    for (const d of DEAD) {
      if (row.f[d.col] === d.constant) reg.hitColumn('DEF-04', name(d.col), { before: d.constant, after: '(column dropped)', period: row.period })
      else all = false
    }
    if (all) reg.hitRow('DEF-04', row.year)
    return 'keep'
  },
}

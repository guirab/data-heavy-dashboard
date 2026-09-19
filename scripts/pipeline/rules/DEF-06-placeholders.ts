import { C, name } from '../schema.ts'
import { NULL_CODE } from './DEF-05-missing-agency.ts'
import type { RowRule } from './types.ts'

/** Column -> code values that mean "no value" in the source. */
const PLACEHOLDERS: Array<{ codeCol: number; nameCol: number | null; codes: Set<string> }> = [
  { codeCol: C.poCode, nameCol: C.poName, codes: new Set(['-1']) },
  { codeCol: C.progGovCode, nameCol: C.progGovName, codes: new Set(['00', '-1']) },
  { codeCol: C.uf, nameCol: null, codes: new Set(['']) },
  { codeCol: C.municipio, nameCol: null, codes: new Set(['']) },
  { codeCol: C.autorCode, nameCol: C.autorName, codes: new Set(['']) },
]

export const DEF06: RowRule = {
  def: {
    id: 'DEF-06',
    title: 'Placeholder values instead of nulls',
    problem: 'Missing values are spelled differently per column: "-1" and "Sem informação" for plano orçamentário, "00" for programa de governo, "SEM EMENDA" for the amendment author, and plain empty strings for UF and município.',
    rule: 'Map every placeholder to a null code; the dictionary gets one explicit "no value" entry per dimension so nulls are filterable, not invisible.',
    action: 'nullify',
    columns: ['Código Plano Orçamentário', 'Plano Orçamentário', 'Código Programa Governo', 'UF', 'Município', 'Código Autor Emenda', 'Nome Autor Emenda'],
  },
  apply(row, reg) {
    let hit = false
    for (const p of PLACEHOLDERS) {
      const code = row.f[p.codeCol]
      if (!p.codes.has(code)) continue
      hit = true
      const label = p.nameCol === null ? code : `${code} / ${row.f[p.nameCol]}`
      reg.hitColumn('DEF-06', name(p.codeCol), { before: JSON.stringify(label), after: 'null', period: row.period })
      row.f[p.codeCol] = NULL_CODE
      if (p.nameCol !== null) row.f[p.nameCol] = ''
    }
    if (hit) reg.hitRow('DEF-06', row.year)
    return 'keep'
  },
}

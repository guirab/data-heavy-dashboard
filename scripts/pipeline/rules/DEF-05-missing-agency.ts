import { C, name } from '../schema.ts'
import type { RowRule } from './types.ts'

/** Marker the pipeline uses for "no value"; dictionaries map it to a `code: null` entry. */
export const NULL_CODE = ''

export const DEF05: RowRule = {
  def: {
    id: 'DEF-05',
    title: 'Missing agency encoded two different ways',
    problem: 'Rows without an agency come in two flavours: (a) empty code + "Sem informação" + unidade gestora "NAO SE APLICA"; (b) code "-1" + "Sem informação" + órgão subordinado "-3" + unidade gestora "Inválido".',
    rule: 'Normalize both to a null agency (and null órgão subordinado). Rows are kept in a "no agency" bucket that the UI excludes from rankings by default.',
    action: 'nullify',
    columns: ['Código Órgão Superior', 'Nome Órgão Superior', 'Código Órgão Subordinado', 'Nome Órgão Subordinado'],
  },
  apply(row, reg) {
    const code = row.f[C.orgSupCode]
    if (code !== '' && code !== '-1') return 'keep'
    const variant = code === '' ? 'a' : 'b'
    reg.hitColumn('DEF-05', name(C.orgSupCode), {
      before: `code=${JSON.stringify(code)} name=${JSON.stringify(row.f[C.orgSupName])} ug=${JSON.stringify(row.f[C.ugName])}`,
      after: 'null',
      period: row.period,
    })
    reg.note('DEF-05', `variant ${variant}: code ${JSON.stringify(code)}, órgão subordinado ${JSON.stringify(row.f[C.orgSubCode])}, unidade gestora ${JSON.stringify(row.f[C.ugName])}`)
    reg.collect('DEF-05', `variant ${variant} occurs in`, row.period)
    row.f[C.orgSupCode] = NULL_CODE
    row.f[C.orgSupName] = ''
    row.f[C.orgSubCode] = NULL_CODE
    row.f[C.orgSubName] = ''
    reg.hitRow('DEF-05', row.year)
    return 'keep'
  },
}

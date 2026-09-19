import { C, name } from '../schema.ts'
import { NULL_CODE } from './DEF-05-missing-agency.ts'
import type { RowRule } from './types.ts'

export const DEF07: RowRule = {
  def: {
    id: 'DEF-07',
    title: 'Amendment author code and name disagree',
    problem: 'Rows with an empty author code but the name "Informação do autor não disponível": the code says "no amendment", the name says "amendment, author unknown".',
    rule: 'Treat as unknown author: null both fields and count. The column is not served, but the count belongs in the report.',
    action: 'nullify',
    columns: ['Código Autor Emenda', 'Nome Autor Emenda'],
  },
  apply(row, reg) {
    if (row.f[C.autorName] !== 'Informação do autor não disponível') return 'keep'
    reg.hitColumn('DEF-07', name(C.autorName), { before: `code="" name="${row.f[C.autorName]}"`, after: 'null', period: row.period })
    row.f[C.autorCode] = NULL_CODE
    row.f[C.autorName] = ''
    reg.hitRow('DEF-07', row.year)
    return 'keep'
  },
}

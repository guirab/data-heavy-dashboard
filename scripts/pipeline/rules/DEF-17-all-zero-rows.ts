import type { RowRule } from './types.ts'

export const DEF17: RowRule = {
  def: {
    id: 'DEF-17',
    title: 'Rows where all six values are 0,00',
    problem: 'A budget line can appear in a month with every amount equal to zero (nothing committed, paid or carried over). It adds a row and no information.',
    rule: 'Drop the row and count it. This is the only rule that drops rows; the count is asserted in validation (input = kept + dropped).',
    action: 'drop-row',
    columns: ['Valor Empenhado (R$)', 'Valor Liquidado (R$)', 'Valor Pago (R$)', 'Valor Restos a Pagar Inscritos (R$)', 'Valor Restos a Pagar Cancelado (R$)', 'Valor Restos a Pagar Pagos (R$)'],
  },
  apply(row, reg) {
    for (let i = 0; i < 6; i++) if (row.v[i] !== 0) return 'keep'
    reg.hitRow('DEF-17', row.year)
    return 'drop'
  },
}

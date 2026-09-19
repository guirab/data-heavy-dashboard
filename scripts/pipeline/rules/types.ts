import type { DefectRule } from '../../../types/dataset.ts'
import type { DefectsRegistry } from '../defects.ts'
import type { Row } from '../schema.ts'

export type RowVerdict = 'keep' | 'drop'

/**
 * A row rule: pure, order-dependent, and accountable. `apply` may mutate the
 * row in place and must report every change through the registry.
 */
export interface RowRule {
  def: DefectRule
  apply(row: Row, reg: DefectsRegistry): RowVerdict
}

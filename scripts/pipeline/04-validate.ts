/**
 * Invariants that must hold before anything is written. A failing invariant
 * is a bug in the pipeline, not a defect in the data, so it throws.
 */
import { DIMENSIONS, MEASURES, type Dictionaries } from '../../types/dataset.ts'
import type { Aggregator, Grouped } from './03-aggregate.ts'
import type { DefectsRegistry } from './defects.ts'

const fmt = (n: number) => n.toLocaleString('en-US')

export function validateYear(year: number, reg: DefectsRegistry, agg: Aggregator, grouped: Grouped, dict: Dictionaries) {
  const input = reg.inputRows[year] ?? 0
  const kept = reg.keptRows[year] ?? 0
  const dropped = reg.droppedRows[year] ?? 0
  if (input !== kept + dropped) throw new Error(`${year}: input ${fmt(input)} != kept ${fmt(kept)} + dropped ${fmt(dropped)}`)
  if (kept === 0) throw new Error(`${year}: no rows kept`)

  // Sums must survive grouping exactly (integer centavos). Dropped rows are all-zero
  // rows only (DEF-17), so raw totals must equal kept totals as well.
  MEASURES.forEach((m, i) => {
    let sum = 0
    const col = grouped.values[i]
    for (let r = 0; r < grouped.rows; r++) {
      const v = col[r]
      if (Number.isNaN(v)) throw new Error(`${year}: NaN in ${m} at row ${r}`)
      sum += v
    }
    if (sum !== agg.keptTotals[i]) throw new Error(`${year}: Σ ${m} grouped ${fmt(sum)} != kept ${fmt(agg.keptTotals[i])}`)
    if (sum !== agg.rawTotals[i]) throw new Error(`${year}: Σ ${m} grouped ${fmt(sum)} != raw ${fmt(agg.rawTotals[i])} (dropped rows changed a total)`)
    if (Math.abs(sum) >= Number.MAX_SAFE_INTEGER) throw new Error(`${year}: Σ ${m} exceeds 2^53`)
  })

  DIMENSIONS.forEach((d, i) => {
    const n = dict[d].length
    if (n > 0xffff) throw new Error(`${year}: dimension ${d} has ${n} entries; exceeds u16`)
    if (dict[d][0].code !== null) throw new Error(`${year}: dimension ${d} id 0 must be the null entry`)
    const col = grouped.dims[i]
    for (let r = 0; r < grouped.rows; r++) if (col[r] >= n) throw new Error(`${year}: ${d} id ${col[r]} out of range at row ${r}`)
    const codes = new Set(dict[d].slice(1).map((e) => e.code))
    if (d !== 'po' && codes.size !== n - 1) throw new Error(`${year}: dimension ${d} has duplicate codes`)
  })
  for (let r = 0; r < grouped.rows; r++) {
    const m = grouped.month[r]
    if (m < 1 || m > 12) throw new Error(`${year}: month ${m} at row ${r}`)
  }
}

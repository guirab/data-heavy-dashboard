import type { DefectExample, DefectResult, DefectRule, DefectsReport } from '../../types/dataset.ts'

const MAX_EXAMPLES = 3

/**
 * Every rule in the pipeline reports through this registry, and the README
 * defects table is generated from its output. A defect nobody counted is a
 * defect nobody can review.
 */
export class DefectsRegistry {
  private rules = new Map<string, DefectResult>()
  inputRows: Record<string, number> = {}
  keptRows: Record<string, number> = {}
  droppedRows: Record<string, number> = {}

  register(rule: DefectRule) {
    if (this.rules.has(rule.id)) throw new Error(`duplicate rule ${rule.id}`)
    this.rules.set(rule.id, { ...rule, affectedRows: {}, columnHits: {}, examples: [], notes: [] })
  }

  private get(id: string) {
    const r = this.rules.get(id)
    if (!r) throw new Error(`unknown rule ${id}`)
    return r
  }

  /** Count one affected row. Rules must call this at most once per row. */
  hitRow(id: string, year: number) {
    const r = this.get(id)
    r.affectedRows[year] = (r.affectedRows[year] ?? 0) + 1
  }

  /** Count `n` affected rows at once (for stage-level rules). */
  addRows(id: string, year: number, n: number) {
    const r = this.get(id)
    r.affectedRows[year] = (r.affectedRows[year] ?? 0) + n
  }

  hitColumn(id: string, column: string, example?: Omit<DefectExample, 'column'>) {
    const r = this.get(id)
    r.columnHits[column] = (r.columnHits[column] ?? 0) + 1
    if (example && r.examples.length < MAX_EXAMPLES && !r.examples.some((e) => e.before === example.before)) {
      r.examples.push({ column, ...example })
    }
  }

  private collected = new Map<string, Map<string, Set<string>>>()

  /** Accumulate values under a label; rendered as one note "label: v1, v2, …" in the report. */
  collect(id: string, label: string, value: string) {
    this.get(id)
    let byLabel = this.collected.get(id)
    if (!byLabel) this.collected.set(id, (byLabel = new Map()))
    let set = byLabel.get(label)
    if (!set) byLabel.set(label, (set = new Set()))
    set.add(value)
  }

  note(id: string, text: string) {
    const r = this.get(id)
    if (!r.notes.includes(text)) r.notes.push(text)
  }

  countInput(year: number, n: number) {
    this.inputRows[year] = (this.inputRows[year] ?? 0) + n
  }
  countKept(year: number, n: number) {
    this.keptRows[year] = (this.keptRows[year] ?? 0) + n
  }
  countDropped(year: number, n: number) {
    this.droppedRows[year] = (this.droppedRows[year] ?? 0) + n
  }

  report(years: number[]): DefectsReport {
    const sortRec = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
    return {
      years,
      inputRows: sortRec(this.inputRows),
      keptRows: sortRec(this.keptRows),
      droppedRows: sortRec(this.droppedRows),
      rules: [...this.rules.values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((r) => {
          const collected = [...(this.collected.get(r.id) ?? new Map<string, Set<string>>()).entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, set]) => `${label}: ${[...set].sort().join(', ')}`)
          return { ...r, affectedRows: sortRec(r.affectedRows), columnHits: sortRec(r.columnHits), notes: [...r.notes, ...collected] }
        }),
    }
  }
}

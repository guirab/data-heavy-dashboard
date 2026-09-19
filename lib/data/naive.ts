/**
 * The naive baseline, kept on purpose. This is how a first implementation
 * usually looks: one object per row with resolved names, Array.filter and
 * Array.sort on every interaction, everything on the main thread.
 * Measured against the worker + typed-array path in docs/perf.md.
 */
import type { Dictionaries, Dimension } from '../../types/dataset.ts'
import type { Query, SortKey } from '../../types/query.ts'
import type { TypedColumn } from './columnar.ts'
import { fold } from './fold.ts'
import { SEARCHABLE } from './engine.ts'

export interface NaiveRow {
  id: number
  month: number
  orgSup: string
  orgSupCode: string | null
  orgSub: string
  funcao: string
  funcaoCode: string | null
  subfuncao: string
  programa: string
  acao: string
  po: string
  grupo: string
  grupoCode: string | null
  elemento: string
  modalidade: string
  modalidadeCode: string | null
  uf: string
  ufCode: string | null
  empenhado: number
  liquidado: number
  pago: number
  rpInscritos: number
  rpCancelado: number
  rpPagos: number
  gap: number
}

const label = (dict: Dictionaries, d: Dimension, id: number) => {
  const e = dict[d][id]
  return id === 0 ? '' : (e.displayName ?? e.name)
}

export function materialize(columns: Record<string, TypedColumn>, dict: Dictionaries): NaiveRow[] {
  const n = columns.month.length
  const rows: NaiveRow[] = new Array(n)
  for (let r = 0; r < n; r++) {
    const e = columns.empenhado[r]
    const p = columns.pago[r]
    rows[r] = {
      id: r,
      month: columns.month[r],
      orgSup: label(dict, 'orgSup', columns.orgSup[r]),
      orgSupCode: dict.orgSup[columns.orgSup[r]].code,
      orgSub: label(dict, 'orgSub', columns.orgSub[r]),
      funcao: label(dict, 'funcao', columns.funcao[r]),
      funcaoCode: dict.funcao[columns.funcao[r]].code,
      subfuncao: label(dict, 'subfuncao', columns.subfuncao[r]),
      programa: label(dict, 'programa', columns.programa[r]),
      acao: label(dict, 'acao', columns.acao[r]),
      po: label(dict, 'po', columns.po[r]),
      grupo: label(dict, 'grupo', columns.grupo[r]),
      grupoCode: dict.grupo[columns.grupo[r]].code,
      elemento: label(dict, 'elemento', columns.elemento[r]),
      modalidade: label(dict, 'modalidade', columns.modalidade[r]),
      modalidadeCode: dict.modalidade[columns.modalidade[r]].code,
      uf: label(dict, 'uf', columns.uf[r]),
      ufCode: dict.uf[columns.uf[r]].code,
      empenhado: e,
      liquidado: columns.liquidado[r],
      pago: p,
      rpInscritos: columns.rpInscritos[r],
      rpCancelado: columns.rpCancelado[r],
      rpPagos: columns.rpPagos[r],
      gap: e - p,
    }
  }
  return rows
}

const CODE_FIELD: Partial<Record<Dimension, keyof NaiveRow>> = { orgSup: 'orgSupCode', funcao: 'funcaoCode', grupo: 'grupoCode', modalidade: 'modalidadeCode', uf: 'ufCode' }

export interface NaiveFilterInput {
  codes: Partial<Record<Dimension, string[]>>
  months: [number, number]
  search: string
  includeNoAgency: boolean
  sort: { key: SortKey; dir: 'asc' | 'desc' }
}

/** Filter + sort the way a first implementation does it: closures, string compares, comparator sort. */
export function naiveQuery(rows: NaiveRow[], q: NaiveFilterInput): { rows: NaiveRow[]; ms: number; noAgencyRows: number } {
  const t0 = performance.now()
  const tokens = fold(q.search).split(/\s+/).filter(Boolean)
  let noAgency = 0
  const filtered = rows.filter((r) => {
    if (r.month < q.months[0] || r.month > q.months[1]) return false
    for (const d of Object.keys(q.codes) as Dimension[]) {
      const sel = q.codes[d]
      if (!sel?.length) continue
      const field = CODE_FIELD[d]
      if (!field || !sel.includes(r[field] as string)) return false
    }
    if (tokens.length) {
      const hay = SEARCHABLE.map((d) => fold(r[d as keyof NaiveRow] as string)).join(' ')
      if (!tokens.every((t) => hay.includes(t))) return false
    }
    if (!q.includeNoAgency && r.orgSupCode === null) {
      noAgency++
      return false
    }
    return true
  })
  const key = q.sort.key as keyof NaiveRow
  const sign = q.sort.dir === 'asc' ? 1 : -1
  filtered.sort((a, b) => {
    const x = a[key]
    const y = b[key]
    if (typeof x === 'number' && typeof y === 'number') return sign * (x - y) || a.id - b.id
    return sign * String(x).localeCompare(String(y), 'pt-BR') || a.id - b.id
  })
  return { rows: filtered, ms: performance.now() - t0, noAgencyRows: noAgency }
}

export type { Query }

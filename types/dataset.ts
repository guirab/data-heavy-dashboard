import type { ColumnarManifest } from '@/lib/data/columnar'

/** Categorical dimensions served per row, in column order. */
export const DIMENSIONS = [
  'orgSup',
  'orgSub',
  'funcao',
  'subfuncao',
  'programa',
  'acao',
  'po',
  'grupo',
  'elemento',
  'modalidade',
  'uf',
] as const
export type Dimension = (typeof DIMENSIONS)[number]

/** Money columns, integer centavos (Float64 in the columnar file; exact below 2^53). */
export const MEASURES = ['empenhado', 'liquidado', 'pago', 'rpInscritos', 'rpCancelado', 'rpPagos'] as const
export type Measure = (typeof MEASURES)[number]

export interface DictEntry {
  /** Source code. `null` marks the "no value" bucket (DEF-05 / DEF-06). */
  code: string | null
  /** Name exactly as in the latest source period (after whitespace rules). */
  name: string
  /** Full name from schema/orgao-superior-overrides.json when the source is truncated (DEF-10). */
  displayName?: string
  /** 'confirmed' = has an override; 'suspected' = exactly 45 UTF-8 bytes, the upstream cut-off. */
  truncated?: 'confirmed' | 'suspected'
  /** Older names seen for the same code in earlier periods (DEF-13). */
  aliases?: string[]
  /** Index of the parent entry (orgSub → orgSup, po → acao). */
  parent?: number
}

export type Dictionaries = Record<Dimension, DictEntry[]>

export interface YearManifest {
  year: number
  /** Months present in the source for this year (1-based). */
  months: number[]
  /** True when fewer than 12 months are published (partial-data state). */
  partial: boolean
  rows: number
  rawRows: number
  columnar: ColumnarManifest
  /** gzip byte size of columns.bin.gz, for the loading progress bar. */
  columnsGzipBytes: number
  sourceLastModified: string | null
  /** SHA-256 of columns.bin.gz so the client can detect a corrupt download (error state). */
  columnsSha256: string
}

export interface AggRow {
  /** Dimension codes (not ids) so aggregates are comparable across years. */
  [key: string]: string | number | null
}

export interface DefectRule {
  id: string
  title: string
  /** What is wrong, in one sentence. */
  problem: string
  /** What the code does about it, in one sentence. */
  rule: string
  action: 'transform' | 'nullify' | 'drop-row' | 'drop-column' | 'keep' | 'document'
  columns: string[]
}

export interface DefectExample {
  column: string
  before: string
  after: string | null
  period: string
}

export interface DefectResult extends DefectRule {
  /** Rows where the rule changed, dropped or flagged something, per year. */
  affectedRows: Record<string, number>
  /** Per-column hit counts across all years. */
  columnHits: Record<string, number>
  examples: DefectExample[]
  /** Free-form facts computed during the run (e.g. distinct codes with several names). */
  notes: string[]
}

export interface DefectsReport {
  years: number[]
  inputRows: Record<string, number>
  keptRows: Record<string, number>
  droppedRows: Record<string, number>
  rules: DefectResult[]
}

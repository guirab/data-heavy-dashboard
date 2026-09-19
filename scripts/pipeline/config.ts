import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const RAW_DIR = path.join(ROOT, 'data', 'raw')
export const MANIFEST_PATH = path.join(ROOT, 'data', 'manifest.json')
export const OUT_DIR = path.join(ROOT, 'public', 'data', 'v1')
export const SCHEMA_DIR = path.join(ROOT, 'schema')

/** Fiscal years served. 2026 is partial (see partial-data state). */
export const YEARS = [2024, 2025, 2026] as const
export type Year = (typeof YEARS)[number]

/** Last month published for the partial year; the portal publishes monthly. */
export const LAST_PUBLISHED = { year: 2026, month: 9 }

export const SOURCE = {
  name: 'Portal da Transparência — Execução da Despesa',
  publisher: 'Controladoria-Geral da União (CGU)',
  page: 'https://portaldatransparencia.gov.br/download-de-dados/despesas-execucao',
  dictionary:
    'https://portaldatransparencia.gov.br/pagina-interna/603453-dicionario-de-dados-execucao-da-despesa',
  downloadUrl: (year: number, month: number) =>
    `https://portaldatransparencia.gov.br/download-de-dados/despesas-execucao/${year}${String(month).padStart(2, '0')}`,
  /** The portal rejects requests without a browser-like UA (observed 2026-09-19). */
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
}

export const period = (year: number, month: number) => `${year}${String(month).padStart(2, '0')}`

export function monthsOf(year: number): number[] {
  const last = year === LAST_PUBLISHED.year ? LAST_PUBLISHED.month : 12
  return Array.from({ length: last }, (_, i) => i + 1)
}

export const rawZipPath = (year: number, month: number) => path.join(RAW_DIR, `despesas-execucao_${period(year, month)}.zip`)

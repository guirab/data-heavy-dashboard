/**
 * Ingestion pipeline: data/raw/*.zip -> public/data/v1/**.
 * Streams one month at a time; every transformation is a rule with a count.
 * Run: pnpm data:build
 */
import fs from 'node:fs'
import path from 'node:path'
import { MEASURES } from '../../types/dataset.ts'
import { readManifest } from './00-download.ts'
import { DEF01, DEF02, readMonth } from './01-read-month.ts'
import { DEF10, DEF12, DEF13, DEF14, DEF15, DictionaryBuilder } from './02-dictionaries.ts'
import { Aggregator, DEF18, preAggregates } from './03-aggregate.ts'
import { validateYear } from './04-validate.ts'
import { emitYear, writeJson } from './05-emit.ts'
import { LAST_PUBLISHED, OUT_DIR, SOURCE, YEARS, monthsOf, period } from './config.ts'
import { DefectsRegistry } from './defects.ts'
import { ROW_RULES } from './rules/index.ts'
import { RAW_HEADER } from './schema.ts'

/** Source columns not served at the G2b grain (an architecture decision, not a defect — see README). */
const NOT_SERVED = [
  'Código Unidade Gestora', 'Nome Unidade Gestora', 'Código Gestão', 'Nome Gestão',
  'Código Unidade Orçamentária', 'Nome Unidade Orçamentária', 'Código Programa Governo', 'Nome Programa Governo',
  'Município', 'Código Subtítulo', 'Nome Subtítulo', 'Código Localizador', 'Nome Localizador',
  'Sigla Localizador', 'Descrição Complementar Localizador', 'Código Autor Emenda', 'Nome Autor Emenda',
  'Código Categoria Econômica', 'Nome Categoria Econômica',
]

const t0 = Date.now()
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`)

function main() {
  const reg = new DefectsRegistry()
  for (const r of ROW_RULES) reg.register(r.def)
  for (const d of [DEF01, DEF02, DEF10, DEF12, DEF13, DEF14, DEF15, DEF18]) reg.register(d)

  const sourceManifest = readManifest()
  const yearly: Array<Record<string, string | number | null>> = []
  const years: Array<Record<string, unknown>> = []

  for (const year of YEARS) {
    const months = monthsOf(year)
    const dict = new DictionaryBuilder(year)
    const agg = new Aggregator()
    let kept = 0
    let dropped = 0
    for (const month of months) {
      const rows = readMonth(year, month, reg)
      for (const row of rows) {
        let verdict: 'keep' | 'drop' = 'keep'
        // DEF-03 runs first and parses the money columns; raw totals are taken right after it.
        for (const rule of ROW_RULES) {
          verdict = rule.apply(row, reg)
          if (rule.def.id === 'DEF-03') agg.addRaw(row)
          if (verdict === 'drop') break
        }
        if (verdict === 'drop') {
          dropped++
          continue
        }
        agg.add(dict.encode(row), row)
        kept++
      }
      log(`${period(year, month)}: ${rows.length.toLocaleString()} rows`)
    }
    reg.countKept(year, kept)
    reg.countDropped(year, dropped)
    reg.addRows('DEF-18', year, kept)

    const dictionaries = dict.finalize(reg)
    const grouped = agg.finalize()
    validateYear(year, reg, agg, grouped, dictionaries)
    const aggs = preAggregates(grouped, dictionaries)
    const files = sourceManifest.files.filter((f) => f.period.startsWith(String(year)))
    const sourceLastModified = files.map((f) => f.sourceLastModified).filter(Boolean).sort().at(-1) ?? null
    const sizes = emitYear(year, months, grouped, dictionaries, aggs, kept + dropped, sourceLastModified)
    log(
      `${year}: raw ${(kept + dropped).toLocaleString()} → served ${grouped.rows.toLocaleString()} rows; ` +
        `${(sizes.rawBytes / 1e6).toFixed(1)}MB raw → ${(sizes.gzipBytes / 1e6).toFixed(1)}MB gz; ` +
        `Σ empenhado R$${(agg.keptTotals[0] / 1e14).toFixed(2)}T, pago R$${(agg.keptTotals[2] / 1e14).toFixed(2)}T`,
    )
    for (const a of aggs.agencyMonth as Array<Record<string, string | number | null>>) {
      const key = `${year}|${a.orgSup}`
      let e = yearly.find((y) => y.key === key)
      if (!e) yearly.push((e = { key, year, orgSup: a.orgSup, name: a.name, ...Object.fromEntries(MEASURES.map((m) => [m, 0])) }))
      for (const m of MEASURES) e[m] = (e[m] as number) + (a[m] as number)
    }
    years.push({ year, months, partial: months.length < 12, rows: grouped.rows, rawRows: kept + dropped, sourceLastModified })
  }

  for (const y of yearly) delete y.key
  writeJson(path.join(OUT_DIR, 'agg', 'yearly.json'), yearly)
  writeJson(
    path.join(OUT_DIR, 'index.json'),
    {
      format: 'v1',
      source: { name: SOURCE.name, publisher: SOURCE.publisher, page: SOURCE.page, dictionary: SOURCE.dictionary },
      lastPublished: LAST_PUBLISHED,
      years,
      rawColumns: RAW_HEADER,
      notServedColumns: NOT_SERVED,
    },
    true,
  )
  writeJson(path.join(OUT_DIR, 'defects-report.json'), reg.report([...YEARS]), true)
  log(`done → ${OUT_DIR}`)
  fs.writeFileSync(path.join(OUT_DIR, '.gitattributes'), '*.gz binary\n')
}

main()

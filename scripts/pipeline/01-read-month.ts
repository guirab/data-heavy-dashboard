/**
 * zip -> bytes -> ISO-8859-1 text -> parsed rows, with the header asserted
 * against schema/raw-header.v1.json. Encoding and header facts are reported
 * as DEF-02 and DEF-01.
 */
import fs from 'node:fs'
import { unzipSync } from 'fflate'
import { parse } from 'csv-parse/sync'
import type { DefectsRegistry } from './defects.ts'
import { RAW_HEADER, C, VALUE_COLS, type Row } from './schema.ts'
import { period as fmtPeriod, rawZipPath } from './config.ts'

export const DEF01 = {
  id: 'DEF-01',
  title: 'Header typo and unstable-looking header',
  problem: 'Column 14 is spelled "Código Subfução" (sic) in every file. Any consumer matching on the correct spelling silently gets nothing.',
  rule: 'The 47 expected names, typo included, live in schema/raw-header.v1.json. Every file is asserted against it; a drift aborts the run instead of shifting columns.',
  action: 'document' as const,
  columns: ['Código Subfução'],
}

export const DEF02 = {
  id: 'DEF-02',
  title: 'ISO-8859-1 encoding, CRLF, every field quoted',
  problem: 'Files are Latin-1 (not UTF-8), use ";" as delimiter, CRLF line endings and quote every field. Reading them as UTF-8 yields mojibake in every accented name.',
  rule: 'Decode with TextDecoder("iso-8859-1") and assert the result has no U+FFFD and no double-encoding signature ("Ã©"-style sequences).',
  action: 'transform' as const,
  columns: ['all columns'],
}

const latin1 = new TextDecoder('iso-8859-1')
const utf8Strict = new TextDecoder('utf-8', { fatal: true })

export function readMonth(year: number, month: number, reg: DefectsRegistry): Row[] {
  const period = fmtPeriod(year, month)
  const zip = fs.readFileSync(rawZipPath(year, month))
  const entries = unzipSync(new Uint8Array(zip))
  const csvName = Object.keys(entries).find((n) => n.toLowerCase().endsWith('.csv'))
  if (!csvName) throw new Error(`${period}: no .csv inside the zip (${Object.keys(entries).join(', ')})`)
  const bytes = entries[csvName]

  let validUtf8 = true
  try {
    utf8Strict.decode(bytes)
  } catch {
    validUtf8 = false
  }
  if (validUtf8) reg.note('DEF-02', `${period}: file decodes as valid UTF-8 (unexpected; still treated as ISO-8859-1)`)
  const text = latin1.decode(bytes)
  const mojibake = (text.match(/Ã[\u0080-¿]/g) ?? []).length
  if (text.includes('�')) throw new Error(`${period}: replacement characters after ISO-8859-1 decode`)
  if (mojibake > 0) reg.note('DEF-02', `${period}: ${mojibake} possible double-encoded sequences`)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) reg.note('DEF-02', `${period}: has a UTF-8 BOM`)
  const crlf = text.indexOf('\r\n') !== -1

  const records = parse(text, {
    delimiter: ';',
    quote: '"',
    relax_column_count: false,
    skip_empty_lines: true,
    trim: false,
  }) as string[][]

  const header = records[0]
  if (header.length !== RAW_HEADER.length || header.some((h, i) => h !== RAW_HEADER[i])) {
    const diff = header.map((h, i) => (h !== RAW_HEADER[i] ? `#${i + 1}: got "${h}", expected "${RAW_HEADER[i]}"` : null)).filter(Boolean)
    throw new Error(`${period}: header drift (${header.length} columns): ${diff.join('; ')}`)
  }
  const rows = records.slice(1)
  reg.countInput(year, rows.length)
  reg.addRows('DEF-01', year, rows.length)
  reg.addRows('DEF-02', year, rows.length)
  reg.hitColumn('DEF-01', 'Código Subfução', { before: 'Código Subfução', after: 'Código Subfunção (kept as published; mapped by position)', period })
  reg.hitColumn('DEF-02', 'all columns', {
    before: `ISO-8859-1, ${crlf ? 'CRLF' : 'LF'}, delimiter ";", ${bytes.length.toLocaleString()} bytes`,
    after: 'UTF-8 in memory',
    period,
  })

  return rows.map((f) => {
    const p = f[C.period]
    if (p !== `${year}/${String(month).padStart(2, '0')}`) throw new Error(`${period}: row has period "${p}"`)
    return { f, v: new Float64Array(VALUE_COLS.length), year, month, period }
  })
}

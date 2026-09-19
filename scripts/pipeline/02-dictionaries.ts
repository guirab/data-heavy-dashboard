/**
 * Dictionary-encodes every categorical dimension. Id 0 of every dimension is
 * the explicit "no value" entry. Names are canonicalized to the latest period
 * seen (DEF-13); older spellings are kept as aliases so nothing is lost.
 * Also home of the truncation (DEF-10), naming-convention (DEF-12), duplicate
 * name (DEF-14) and composite key (DEF-15) observations.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DIMENSIONS, type DictEntry, type Dictionaries, type Dimension } from '../../types/dataset.ts'
import { SCHEMA_DIR } from './config.ts'
import type { DefectsRegistry } from './defects.ts'
import { C, type Row } from './schema.ts'

export const DEF10 = {
  id: 'DEF-10',
  title: 'Names truncated at the source (45 UTF-8 bytes)',
  problem: 'Several name columns are cut at exactly 45 bytes of UTF-8 — bytes, not characters, so "Ministério da Ciência, Tecnologia e Inovaç" loses more letters than an unaccented name would. The cut happened upstream; the file cannot recover it.',
  rule: 'Kept as published. For órgão superior, a 9-entry hand-curated override table supplies the full name (the only manual data in the repo). Entries at exactly 45 bytes elsewhere are flagged "suspected" so the UI can say so.',
  action: 'document' as const,
  columns: ['Nome Órgão Superior', 'Nome Elemento de Despesa', 'Nome Unidade Orçamentária'],
}
export const DEF12 = {
  id: 'DEF-12',
  title: 'Three naming conventions in one file',
  problem: 'Some name columns are Title Case with accents (órgão, função), others are UPPER CASE without accents (ação, plano orçamentário), and a few mix both across rows.',
  rule: 'Displayed as published. Search folds accents and case so "acao" matches "AÇÃO" and "Ação".',
  action: 'document' as const,
  columns: ['all name columns'],
}
export const DEF13 = {
  id: 'DEF-13',
  title: 'Same code, different names across periods',
  problem: 'A code can change its name between months (renamed programs, "- DESPESAS DIVERSAS" suffixes appearing mid-year).',
  rule: 'The dictionary keeps one entry per code with the name from the latest period; earlier names are stored as aliases and counted here. Nothing is keyed by name.',
  action: 'transform' as const,
  columns: ['Plano Orçamentário', 'Nome Órgão Subordinado', 'Nome Ação'],
}
export const DEF14 = {
  id: 'DEF-14',
  title: 'Same name, different codes',
  problem: 'Distinct codes can share a display name (e.g. several "ADMINISTRACAO DA UNIDADE" plans under different actions).',
  rule: 'Never join or group by name; all keys are codes. The count is reported so the UI can disambiguate with the code when needed.',
  action: 'document' as const,
  columns: ['Plano Orçamentário', 'Nome Órgão Subordinado', 'Nome Ação'],
}
export const DEF15 = {
  id: 'DEF-15',
  title: '"Código Plano Orçamentário" is not a key',
  problem: 'The plano orçamentário code is only unique inside an action and an agency: code "0001" under action "2000" names 30 different plans in FY2025.',
  rule: 'Plano orçamentário is keyed by (órgão subordinado, ação, código PO); the dictionary entry points to its parent action.',
  action: 'transform' as const,
  columns: ['Código Plano Orçamentário'],
}

const TRUNCATION_BYTES = 45
const utf8 = new TextEncoder()

interface NameStat {
  rows: number
  lastPeriod: string
}

class DimensionBuilder {
  entries: DictEntry[] = [{ code: null, name: '' }]
  private ids = new Map<string, number>()
  /** key -> name -> stats, for canonical-name selection at the end */
  private names = new Map<string, Map<string, NameStat>>()

  readonly dim: Dimension
  /** Naming convention observed in this column (DEF-12). */
  casing = ''
  truncatedConfirmed = 0
  truncatedSuspected = 0
  constructor(dim: Dimension) {
    this.dim = dim
  }

  intern(key: string, code: string, name: string, period: string, parent?: number): number {
    if (code === '') return 0
    let id = this.ids.get(key)
    if (id === undefined) {
      id = this.entries.length
      this.ids.set(key, id)
      const e: DictEntry = { code, name }
      if (parent !== undefined) e.parent = parent
      this.entries.push(e)
    }
    let byName = this.names.get(key)
    if (!byName) this.names.set(key, (byName = new Map()))
    const st = byName.get(name)
    if (st) {
      st.rows++
      if (period > st.lastPeriod) st.lastPeriod = period
    } else byName.set(name, { rows: 1, lastPeriod: period })
    return id
  }

  /** Pick canonical names, aliases, truncation flags; report DEF-13/14/10. */
  finalize(reg: DefectsRegistry, year: number, overrides: Record<string, string>) {
    let driftRows = 0
    let driftCodes = 0
    for (const [key, byName] of this.names) {
      const id = this.ids.get(key)!
      const e = this.entries[id]
      if (byName.size > 1) {
        driftCodes++
        const ranked = [...byName.entries()].sort((a, b) => b[1].lastPeriod.localeCompare(a[1].lastPeriod) || b[1].rows - a[1].rows)
        e.name = ranked[0][0]
        e.aliases = ranked.slice(1).map(([n]) => n)
        for (const [n, st] of ranked.slice(1)) {
          driftRows += st.rows
          reg.hitColumn('DEF-13', this.dim, { before: `${e.code}: "${n}"`, after: `"${e.name}"`, period: st.lastPeriod })
        }
      }
    }
    if (driftCodes > 0) {
      reg.note('DEF-13', `${year} ${this.dim}: ${driftCodes} codes with more than one name (${driftRows.toLocaleString()} rows carried a non-latest name)`)
      reg.addRows('DEF-13', year, driftRows)
    }

    const byName = new Map<string, number>()
    for (const e of this.entries.slice(1)) byName.set(e.name, (byName.get(e.name) ?? 0) + 1)
    const dupNames = [...byName.values()].filter((n) => n > 1).length
    if (dupNames > 0) {
      reg.note('DEF-14', `${year} ${this.dim}: ${dupNames} names shared by more than one code`)
      reg.hitColumn('DEF-14', this.dim)
    }

    let upper = 0
    let other = 0
    for (const e of this.entries.slice(1)) {
      if (e.name === e.name.toUpperCase()) upper++
      else other++
    }
    this.casing = upper > 0 && other > 0 ? `mixed (${upper} upper / ${other} title)` : upper > 0 ? 'UPPER' : 'Title'

    // A column shows the upstream cut-off only if its longest name is exactly 45 bytes;
    // a 45-byte name in a column that also has 200-byte names is just a 45-byte name.
    const maxBytes = Math.max(0, ...this.entries.slice(1).map((e) => utf8.encode(e.name).byteLength))
    for (const e of this.entries.slice(1)) {
      const full = e.code !== null ? overrides[e.code] : undefined
      if (this.dim === 'orgSup' && full !== undefined) {
        if (full !== e.name) {
          e.displayName = full
          e.truncated = 'confirmed'
          this.truncatedConfirmed++
          reg.hitColumn('DEF-10', 'Nome Órgão Superior', { before: e.name, after: full, period: String(year) })
        }
        // full === name: hand-verified complete despite being 45 bytes long; no flag.
      } else if (maxBytes === TRUNCATION_BYTES && utf8.encode(e.name).byteLength === TRUNCATION_BYTES) {
        e.truncated = 'suspected'
        this.truncatedSuspected++
        reg.hitColumn('DEF-10', `${this.dim} (suspected)`, { before: e.name, after: null, period: String(year) })
      }
    }
    if (maxBytes === TRUNCATION_BYTES) {
      reg.note('DEF-10', `${year} ${this.dim}: longest name is exactly 45 bytes (column cut upstream) — ${this.truncatedConfirmed} confirmed via overrides, ${this.truncatedSuspected} suspected`)
    }
  }
}

export class DictionaryBuilder {
  readonly dims: Record<Dimension, DimensionBuilder>
  readonly year: number
  private overrides: Record<string, string>

  constructor(year: number) {
    this.year = year
    this.dims = Object.fromEntries(DIMENSIONS.map((d) => [d, new DimensionBuilder(d)])) as Record<Dimension, DimensionBuilder>
    const raw = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'orgao-superior-overrides.json'), 'utf8')) as Record<string, string>
    delete raw.$comment
    this.overrides = raw
  }

  /** Returns the dimension ids for a normalized row, in DIMENSIONS order. */
  encode(row: Row): number[] {
    const f = row.f
    const p = row.period
    const d = this.dims
    const orgSup = d.orgSup.intern(f[C.orgSupCode], f[C.orgSupCode], f[C.orgSupName], p)
    const orgSub = d.orgSub.intern(f[C.orgSubCode], f[C.orgSubCode], f[C.orgSubName], p, orgSup)
    const funcao = d.funcao.intern(f[C.funcaoCode], f[C.funcaoCode], f[C.funcaoName], p)
    const subfuncao = d.subfuncao.intern(f[C.subfuncaoCode], f[C.subfuncaoCode], f[C.subfuncaoName], p)
    const programa = d.programa.intern(f[C.programaCode], f[C.programaCode], f[C.programaName], p)
    const acao = d.acao.intern(f[C.acaoCode], f[C.acaoCode], f[C.acaoName], p)
    const po = d.po.intern(`${f[C.orgSubCode]}|${f[C.acaoCode]}|${f[C.poCode]}`, f[C.poCode], f[C.poName], p, acao)
    const grupo = d.grupo.intern(f[C.grupoCode], f[C.grupoCode], f[C.grupoName], p)
    const elemento = d.elemento.intern(f[C.elementoCode], f[C.elementoCode], f[C.elementoName], p)
    const modalidade = d.modalidade.intern(f[C.modalidadeCode], f[C.modalidadeCode], f[C.modalidadeName], p)
    const uf = d.uf.intern(f[C.uf], f[C.uf], f[C.uf], p)
    return [orgSup, orgSub, funcao, subfuncao, programa, acao, po, grupo, elemento, modalidade, uf]
  }

  finalize(reg: DefectsRegistry): Dictionaries {
    for (const d of DIMENSIONS) this.dims[d].finalize(reg, this.year, this.overrides)
    const byCasing = new Map<string, string[]>()
    for (const d of DIMENSIONS) {
      const c = this.dims[d].casing
      byCasing.set(c, [...(byCasing.get(c) ?? []), d])
    }
    reg.note('DEF-12', `${this.year}: ` + [...byCasing.entries()].map(([c, dims]) => `${c}: ${dims.join(', ')}`).join(' · '))
    const poEntries = this.dims.po.entries.length - 1
    const poCodes = new Set(this.dims.po.entries.slice(1).map((e) => e.code)).size
    reg.note('DEF-15', `${this.year}: ${poCodes} distinct PO codes expand to ${poEntries.toLocaleString()} (órgão subordinado, ação, PO) keys`)
    reg.hitColumn('DEF-15', 'Código Plano Orçamentário')
    return Object.fromEntries(DIMENSIONS.map((d) => [d, this.dims[d].entries])) as Dictionaries
  }
}

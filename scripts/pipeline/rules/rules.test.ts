/**
 * Every rule is exercised on a real row from the source (fixtures extracted
 * from the 2025 files, not typed by hand), so a test failure means the data
 * or the rule changed — never that a made-up example was wrong.
 */
import { describe, expect, it } from 'vitest'
import fixtures from './__fixtures__/rows.json'
import { DefectsRegistry } from '../defects.ts'
import { C, RAW_HEADER, VALUE_COLS, type Row } from '../schema.ts'
import { ROW_RULES } from './index.ts'
import { DEF03, parseCentavos } from './DEF-03-money-as-text.ts'
import { DEF04 } from './DEF-04-dead-columns.ts'
import { DEF05 } from './DEF-05-missing-agency.ts'
import { DEF06 } from './DEF-06-placeholders.ts'
import { DEF07 } from './DEF-07-author-mismatch.ts'
import { DEF08 } from './DEF-08-space-runs.ts'
import { DEF09 } from './DEF-09-whitespace.ts'
import { DEF11 } from './DEF-11-mangled-section-sign.ts'
import { DEF16 } from './DEF-16-negative-amounts.ts'
import { DEF17 } from './DEF-17-all-zero-rows.ts'
import type { RowRule } from './types.ts'

type FixtureName = keyof typeof fixtures.rows

const row = (name: FixtureName): Row => {
  const f = [...(fixtures.rows[name] as string[])]
  const [y, m] = f[C.period].split('/')
  return { f, v: new Float64Array(6), year: Number(y), month: Number(m), period: `${y}${m}` }
}

const registry = (...rules: RowRule[]) => {
  const reg = new DefectsRegistry()
  for (const r of rules) reg.register(r.def)
  return reg
}

const run = (rule: RowRule, r: Row, reg = registry(rule)) => ({ verdict: rule.apply(r, reg), report: reg.report([r.year]).rules.find((x) => x.id === rule.def.id)! })

describe('fixtures', () => {
  it('carry the published header, typo included', () => {
    expect(fixtures.header).toEqual(RAW_HEADER)
    expect(fixtures.header[C.subfuncaoCode]).toBe('Código Subfução')
  })
})

describe('DEF-03 money as text', () => {
  it('parses decimal-comma strings to integer centavos', () => {
    expect(parseCentavos('13404423,26')).toBe(1340442326)
    expect(parseCentavos('-1796000,00')).toBe(-179600000)
    expect(parseCentavos('0,00')).toBe(0)
  })
  it('refuses anything else instead of producing NaN', () => {
    expect(() => parseCentavos('1.234,56')).toThrow()
    expect(() => parseCentavos('12,3')).toThrow()
    expect(() => parseCentavos('')).toThrow()
  })
  it('fills row.v from the six value columns and counts every row', () => {
    const r = row('normal')
    const { report } = run(DEF03, r)
    expect(r.v[0]).toBe(parseCentavos(r.f[C.empenhado]))
    expect(r.v[2]).toBe(parseCentavos(r.f[C.pago]))
    expect(report.affectedRows[r.year]).toBe(1)
    expect(Object.keys(report.columnHits)).toHaveLength(VALUE_COLS.length)
  })
})

describe('DEF-17 all-zero rows', () => {
  it('drops a row whose six values are all 0,00 and counts it', () => {
    const r = row('allZero')
    DEF03.apply(r, registry(DEF03))
    const { verdict, report } = run(DEF17, r)
    expect(verdict).toBe('drop')
    expect(report.affectedRows[r.year]).toBe(1)
  })
  it('keeps a row with any non-zero value', () => {
    const r = row('negative')
    DEF03.apply(r, registry(DEF03))
    expect(run(DEF17, r).verdict).toBe('keep')
  })
})

describe('DEF-09 trailing whitespace', () => {
  it('trims and reports the column', () => {
    const r = row('trailingSpace')
    const before = r.f[C.localizadorName]
    expect(before).not.toBe(before.trim())
    const { report } = run(DEF09, r)
    expect(r.f[C.localizadorName]).toBe(before.trim())
    expect(report.columnHits['Nome Localizador']).toBe(1)
    expect(report.examples[0].before).toBe(JSON.stringify(before))
  })
})

describe('DEF-08 space runs', () => {
  it('collapses runs of spaces inside names', () => {
    const r = row('spaceRuns')
    expect(r.f[C.subtituloName]).toMatch(/\s{2,}/)
    const { report } = run(DEF08, r)
    expect(r.f[C.subtituloName]).not.toMatch(/\s{2,}/)
    expect(report.affectedRows[r.year]).toBe(1)
  })
})

describe('DEF-05 missing agency', () => {
  it.each([
    ['missingAgencyA', ''],
    ['missingAgencyB', '-1'],
  ] as const)('normalizes variant %s (code %j) to a null agency', (name, code) => {
    const r = row(name)
    expect(r.f[C.orgSupCode]).toBe(code)
    expect(r.f[C.orgSupName]).toBe('Sem informação')
    const { report } = run(DEF05, r)
    expect(r.f[C.orgSupCode]).toBe('')
    expect(r.f[C.orgSubCode]).toBe('')
    expect(report.affectedRows[r.year]).toBe(1)
    expect(report.notes.some((n) => n.includes(JSON.stringify(code)))).toBe(true)
  })
  it('leaves real agencies alone', () => {
    const r = row('normal')
    run(DEF05, r)
    expect(r.f[C.orgSupCode]).toBe('52000')
  })
})

describe('DEF-06 placeholders', () => {
  it('nulls "-1" plano orçamentário, "00" programa de governo, SEM EMENDA and empty UF/município', () => {
    const r = row('poPlaceholder')
    expect(r.f[C.poCode]).toBe('-1')
    const { report } = run(DEF06, r)
    expect(r.f[C.poCode]).toBe('')
    expect(r.f[C.poName]).toBe('')
    expect(r.f[C.progGovCode]).toBe('')
    expect(report.columnHits['Código Plano Orçamentário']).toBe(1)
    expect(report.columnHits['Código Programa Governo']).toBe(1)
  })
  it('keeps a filled UF', () => {
    const r = row('normal')
    const uf = r.f[C.uf]
    expect(uf).toMatch(/^[A-Z]{2}$/)
    run(DEF06, r)
    expect(r.f[C.uf]).toBe(uf)
  })
})

describe('DEF-07 author mismatch', () => {
  it('nulls code and name when the name says the author is unavailable', () => {
    const r = row('authorUnavailable')
    expect(r.f[C.autorCode]).toBe('')
    const { report } = run(DEF07, r)
    expect(r.f[C.autorName]).toBe('')
    expect(report.affectedRows[r.year]).toBe(1)
  })
})

describe('DEF-04 dead columns', () => {
  it('sees the constant placeholder in all three columns of a normal row', () => {
    const r = row('normal')
    const { report } = run(DEF04, r)
    expect(report.affectedRows[r.year]).toBe(1)
    expect(Object.keys(report.columnHits)).toHaveLength(3)
  })
})

describe('DEF-11 mangled §', () => {
  it('counts but does not change the text', () => {
    const r = row('mangledSection')
    const before = r.f[C.poName]
    expect(before).toContain('??')
    const { report } = run(DEF11, r)
    expect(r.f[C.poName]).toBe(before)
    expect(report.affectedRows[r.year]).toBe(1)
  })
})

describe('DEF-16 negative amounts', () => {
  it('keeps negatives and counts the columns', () => {
    const r = row('negative')
    DEF03.apply(r, registry(DEF03))
    const { verdict, report } = run(DEF16, r)
    expect(verdict).toBe('keep')
    expect(r.v[0]).toBeLessThan(0)
    expect(report.columnHits['Valor Empenhado (R$)']).toBe(1)
  })
})

describe('rule order', () => {
  it('runs DEF-04 and DEF-07 before the null-encoding rules erase their evidence', () => {
    const ids = ROW_RULES.map((r) => r.def.id)
    expect(ids.indexOf('DEF-03')).toBe(0)
    expect(ids.indexOf('DEF-17')).toBe(1)
    expect(ids.indexOf('DEF-04')).toBeLessThan(ids.indexOf('DEF-06'))
    expect(ids.indexOf('DEF-07')).toBeLessThan(ids.indexOf('DEF-06'))
    expect(ids.indexOf('DEF-09')).toBeLessThan(ids.indexOf('DEF-05'))
  })
  it('the full chain keeps a normal row and drops an all-zero one', () => {
    const reg = registry(...ROW_RULES)
    const keep = row('normal')
    const drop = row('allZero')
    expect(ROW_RULES.reduce<'keep' | 'drop'>((v, rule) => (v === 'drop' ? v : rule.apply(keep, reg)), 'keep')).toBe('keep')
    expect(ROW_RULES.reduce<'keep' | 'drop'>((v, rule) => (v === 'drop' ? v : rule.apply(drop, reg)), 'keep')).toBe('drop')
  })
})

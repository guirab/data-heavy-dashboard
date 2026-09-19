/**
 * Drives the built app with Playwright and records interaction → paint
 * timings for the naive baselines and the real dashboard, then writes the
 * results table to docs/perf-results.md (included by docs/perf.md).
 *
 * Usage: pnpm build && pnpm start -p 3100 &  then  pnpm perf:measure [runs]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium, type Page } from '@playwright/test'

const BASE = process.env.PERF_BASE ?? 'http://localhost:3100'
const RUNS = Number(process.argv[2] ?? 5)
const ROOT = path.resolve(import.meta.dirname, '../..')

interface Mode {
  id: string
  label: string
  url: string
  /** Full DOM baselines can take a minute per interaction; cap the wait. */
  timeoutMs: number
}

const MODES: Mode[] = [
  { id: 'A10k', label: 'A · naive, plain table, 10k rows in DOM', url: '/?mode=naive&rows=10000', timeoutMs: 120_000 },
  { id: 'A50k', label: 'A · naive, plain table, 50k rows in DOM', url: '/?mode=naive&rows=50000', timeoutMs: 240_000 },
  { id: 'B', label: 'B · naive compute, virtualized rows (all rows)', url: '/?mode=naive&virtual=1&rows=all', timeoutMs: 120_000 },
  { id: 'C', label: 'C · worker + typed arrays + virtualized grid, comparator sort (all rows)', url: '/?engine=comparator', timeoutMs: 60_000 },
  { id: 'D', label: 'D · C + radix sort in the worker (all rows) — shipped', url: '/', timeoutMs: 60_000 },
]

interface Step {
  name: string
  run: (page: Page) => Promise<void>
}

const STEPS: Step[] = [
  { name: 'sort by Paid', run: (p) => p.getByRole('button', { name: 'Paid', exact: true }).first().click() },
  { name: 'search "universidade"', run: (p) => p.getByLabel('Search budget lines by agency, program, action or element').fill('universidade') },
  { name: 'clear search', run: (p) => p.getByLabel('Search budget lines by agency, program, action or element').fill('') },
  {
    name: 'months jun–dez',
    run: async (p) => {
      await p.getByLabel('From month').selectOption('6')
    },
  },
  {
    name: 'filter agency (Educação)',
    run: async (p) => {
      await p.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Agency/ }).click()
      await p.getByRole('checkbox', { name: 'Ministério da Educação' }).check()
      await p.keyboard.press('Escape')
    },
  },
]

interface Sample {
  mode: string
  step: string
  ms: number
  commitMs: number
  engineMs: number | null
  rows: number
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

async function heapMB(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const { metrics } = await cdp.send('Performance.getMetrics')
  await cdp.detach()
  return (metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1e6
}

async function measureMode(mode: Mode): Promise<{ samples: Sample[]; loadMs: number[]; heap: number[]; failed: string | null }> {
  const browser = await chromium.launch()
  const samples: Sample[] = []
  const loadMs: number[] = []
  const heap: number[] = []
  let failed: string | null = null
  try {
    for (let run = 0; run < RUNS; run++) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
      page.setDefaultTimeout(mode.timeoutMs)
      const t0 = Date.now()
      await page.goto(BASE + mode.url, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector(mode.id === 'C' || mode.id === 'D' ? '[role="gridcell"]' : 'table tbody tr, [class*="absolute"]', { timeout: mode.timeoutMs })
      loadMs.push(Date.now() - t0)
      // Let the first paint settle before measuring interactions.
      await page.waitForTimeout(500)
      heap.push(await heapMB(page))
      for (const step of STEPS) {
        const before = await page.evaluate(() => (window.__perfLog ?? []).length)
        const t = Date.now()
        try {
          await step.run(page)
          await page.waitForFunction((n) => (window.__perfLog ?? []).length > n && window.__perfLog![window.__perfLog!.length - 1].done, before, { timeout: mode.timeoutMs })
          const e = await page.evaluate(() => window.__perfLog![window.__perfLog!.length - 1])
          samples.push({ mode: mode.id, step: step.name, ms: e.ms, commitMs: e.commitMs, engineMs: e.engineMs ?? null, rows: e.rows ?? 0 })
          process.stdout.write(`  ${mode.id} run ${run + 1} ${step.name}: ${e.ms.toFixed(0)}ms (commit ${e.commitMs.toFixed(0)}, engine ${e.engineMs?.toFixed(0) ?? '-'})\n`)
        } catch {
          failed = `${step.name}: no paint within ${((Date.now() - t) / 1000).toFixed(0)}s`
          process.stdout.write(`  ${mode.id} run ${run + 1} ${step.name}: FAILED (${failed})\n`)
          break
        }
      }
      await page.close()
      if (failed) break
    }
  } finally {
    await browser.close()
  }
  return { samples, loadMs, heap, failed }
}

function render(results: Array<{ mode: Mode; samples: Sample[]; loadMs: number[]; heap: number[]; failed: string | null }>) {
  const lines: string[] = []
  lines.push(`Measured ${new Date().toISOString().slice(0, 10)} on ${os.cpus()[0]?.model.trim() ?? 'unknown CPU'}, ${Math.round(os.totalmem() / 1e9)} GB RAM, headless Chromium via Playwright, production build served locally (\`next start\`). ${RUNS} runs per cell; values are medians of interaction → next painted frame, in ms. Engine = filter+sort time alone (worker or main thread).`)
  lines.push('')
  lines.push(`| Mode | Load → first rows | JS heap after load | ${STEPS.map((s) => s.name).join(' | ')} |`)
  lines.push(`| --- | --- | --- | ${STEPS.map(() => '---').join(' | ')} |`)
  for (const r of results) {
    const cells = STEPS.map((s) => {
      const xs = r.samples.filter((x) => x.step === s.name)
      if (!xs.length) return r.failed?.startsWith(s.name) ? `**${r.failed.split(': ')[1]}**` : '—'
      const eng = xs.filter((x) => x.engineMs !== null).map((x) => x.engineMs!)
      return `**${median(xs.map((x) => x.ms)).toFixed(0)}** (engine ${eng.length ? median(eng).toFixed(0) : '-'})`
    })
    lines.push(`| ${r.mode.label} | ${r.loadMs.length ? median(r.loadMs).toFixed(0) + ' ms' : '—'} | ${r.heap.length ? median(r.heap).toFixed(0) + ' MB' : '—'} | ${cells.join(' | ')} |`)
  }
  lines.push('')
  lines.push(`Row counts after each step (mode D): ${STEPS.map((s) => {
    const x = results.find((r) => r.mode.id === 'D')?.samples.find((y) => y.step === s.name)
    return `${s.name} → ${x ? x.rows.toLocaleString('en-US') : '—'}`
  }).join('; ')}.`)
  return lines.join('\n') + '\n'
}

async function main() {
  const results = []
  for (const mode of MODES) {
    console.log(`\n${mode.label}`)
    results.push({ mode, ...(await measureMode(mode)) })
  }
  const out = path.join(ROOT, 'docs', 'perf-results.md')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, render(results))
  fs.writeFileSync(path.join(ROOT, 'docs', 'perf-results.json'), JSON.stringify(results.map((r) => ({ mode: r.mode.id, loadMs: r.loadMs, heap: r.heap, failed: r.failed, samples: r.samples })), null, 2))
  console.log(`\nwrote ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

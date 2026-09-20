/**
 * Cold and warm page load → first grid rows, per device profile, with the
 * browser's own resource timings for the data files. Answers "when does the
 * first data byte start moving, and how much of the load is the network?".
 * Writes docs/perf-load.md and docs/perf-load.json.
 *
 * Usage: pnpm build && pnpm start -p 3100 &  then  pnpm perf:load [runs]
 *        PERF_PROFILE=mobile pnpm perf:load 3   (one profile; default runs both)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium, type Page, type Request } from '@playwright/test'
import { applyProfile, PROFILES, type Profile } from './profile.ts'

const BASE = process.env.PERF_BASE ?? 'http://localhost:3100'
const RUNS = Number(process.argv[2] ?? 3)
const ROOT = path.resolve(import.meta.dirname, '../..')
const profiles: Profile[] = process.env.PERF_PROFILE ? [PROFILES[process.env.PERF_PROFILE as keyof typeof PROFILES]] : Object.values(PROFILES)

interface Timing {
  /** ms from navigation start until the first request to /data/v1/ was issued. */
  firstDataRequestMs: number
  /** ms until the columns file finished downloading. */
  columnsDoneMs: number
  /** ms until the first [role="gridcell"] was in the DOM. */
  firstRowsMs: number
  /** Bytes over the wire for /data/v1/*, as reported by Resource Timing. */
  dataTransferBytes: number
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/**
 * The data files are fetched inside the worker, so the document's Resource Timing never
 * sees them; Playwright's request events do (the same way page.route intercepts them).
 */
async function loadOnce(page: Page, timeoutMs: number): Promise<Timing> {
  let navStart = 0
  let firstDataRequestMs = NaN
  let columnsDoneMs = NaN
  let dataTransferBytes = 0
  const isData = (url: string) => url.includes('/data/v1/')
  const onRequest = (r: Request) => {
    if (isData(r.url()) && Number.isNaN(firstDataRequestMs)) firstDataRequestMs = Date.now() - navStart
  }
  const onFinished = async (r: Request) => {
    if (!isData(r.url())) return
    if (r.url().includes('columns.bin.gz')) columnsDoneMs = Date.now() - navStart
    dataTransferBytes += (await r.sizes()).responseBodySize
  }
  page.on('request', onRequest)
  page.on('requestfinished', onFinished)
  navStart = Date.now()
  await page.goto(BASE + '/', { waitUntil: 'commit' })
  await page.waitForSelector('[role="gridcell"]', { timeout: timeoutMs })
  const firstRowsMs = Date.now() - navStart
  // Let the last requestfinished handlers settle before reading the byte count.
  await page.waitForTimeout(100)
  page.off('request', onRequest)
  page.off('requestfinished', onFinished)
  return { firstDataRequestMs, columnsDoneMs, firstRowsMs, dataTransferBytes }
}

async function measure(profile: Profile) {
  const browser = await chromium.launch()
  const cold: Timing[] = []
  const warm: Timing[] = []
  const timeoutMs = profile.network ? 180_000 : 60_000
  try {
    for (let run = 0; run < RUNS; run++) {
      // A new context per run = empty HTTP cache; the second navigation in it is the warm load.
      const context = await browser.newContext({ viewport: profile.viewport })
      const page = await context.newPage()
      await applyProfile(page, profile)
      cold.push(await loadOnce(page, timeoutMs))
      warm.push(await loadOnce(page, timeoutMs))
      process.stdout.write(`  ${profile.id} run ${run + 1}: cold ${cold.at(-1)!.firstRowsMs.toFixed(0)} ms (first data request at ${cold.at(-1)!.firstDataRequestMs.toFixed(0)}), warm ${warm.at(-1)!.firstRowsMs.toFixed(0)} ms\n`)
      await context.close()
    }
  } finally {
    await browser.close()
  }
  return { profile, cold, warm }
}

type Result = Awaited<ReturnType<typeof measure>>

function render(results: Result[]) {
  const med = (xs: Timing[], k: keyof Timing) => median(xs.map((x) => x[k])).toFixed(0)
  const kb = (xs: Timing[]) => (median(xs.map((x) => x.dataTransferBytes)) / 1e6).toFixed(2)
  const lines = [
    `Measured ${new Date().toISOString().slice(0, 10)} on ${os.cpus()[0]?.model.trim() ?? 'unknown CPU'}, headless Chromium via Playwright, production build served locally (\`next start\`). ${RUNS} runs per profile; medians in ms from navigation start. Cold = empty HTTP cache; warm = second navigation in the same context. Throttling is applied through CDP.`,
    '',
    '| Profile | Cold: first /data request | Cold: columns downloaded | Cold: first rows | Warm: first rows | Data over the wire |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.profile.label} | ${med(r.cold, 'firstDataRequestMs')} ms | ${med(r.cold, 'columnsDoneMs')} ms | **${med(r.cold, 'firstRowsMs')} ms** | **${med(r.warm, 'firstRowsMs')} ms** | ${kb(r.cold)} MB |`),
    '',
  ]
  return lines.join('\n')
}

async function main() {
  const results: Result[] = []
  for (const profile of profiles) {
    console.log(`\n${profile.label}`)
    results.push(await measure(profile))
  }
  const out = path.join(ROOT, 'docs', 'perf-load.md')
  fs.writeFileSync(out, render(results))
  fs.writeFileSync(path.join(ROOT, 'docs', 'perf-load.json'), JSON.stringify(results.map((r) => ({ profile: r.profile.id, cold: r.cold, warm: r.warm })), null, 2))
  console.log(`\nwrote ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

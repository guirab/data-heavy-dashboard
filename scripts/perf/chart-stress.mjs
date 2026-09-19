// Runs /experiments/chart-stress headlessly and prints the results table as Markdown.
import { chromium } from '@playwright/test'
const base = process.env.PERF_BASE ?? 'http://localhost:3100'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
await page.goto(`${base}/experiments/chart-stress`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Run all/ }).click()
await page.waitForFunction(() => (window.__chartStress ?? []).length === 4, null, { timeout: 300_000 })
const rows = await page.evaluate(() => window.__chartStress)
console.log('| Points | Recharts (SVG) to paint | SVG nodes | Canvas draw |')
console.log('| --- | --- | --- | --- |')
for (const r of rows) console.log(`| ${r.points.toLocaleString('en-US')} | ${r.rechartsPaintMs.toFixed(0)} ms | ${r.svgNodes.toLocaleString('en-US')} | ${r.canvasMs.toFixed(1)} ms |`)
await browser.close()

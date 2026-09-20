// Runs Lighthouse (desktop + mobile presets) against a served production build using
// Playwright's Chromium, and saves trimmed reports to docs/lighthouse-{preset}.json so the
// README numbers can be regenerated. Usage: pnpm build && pnpm start -p 3000 &  pnpm perf:lighthouse
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.env.PERF_BASE ?? 'http://localhost:3000'
const root = path.resolve(import.meta.dirname, '../..')
const chromePath = chromium.executablePath()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-'))
const KEEP = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'interactive', 'total-byte-weight', 'dom-size', 'server-response-time']

const rows = []
for (const preset of ['desktop', 'mobile']) {
  const out = path.join(tmp, `${preset}.json`)
  execFileSync('pnpm', ['dlx', 'lighthouse', base + '/', '--chrome-flags=--headless=new --no-sandbox', ...(preset === 'desktop' ? ['--preset=desktop'] : []), '--output=json', `--output-path=${out}`, '--quiet'], { env: { ...process.env, CHROME_PATH: chromePath }, stdio: 'inherit' })
  const r = JSON.parse(fs.readFileSync(out, 'utf8'))
  const summary = {
    preset,
    lighthouseVersion: r.lighthouseVersion,
    fetchTime: r.fetchTime,
    url: r.finalDisplayedUrl,
    scores: Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
    audits: Object.fromEntries(KEEP.filter((k) => r.audits[k]).map((k) => [k, { value: r.audits[k].numericValue, display: r.audits[k].displayValue, score: r.audits[k].score }])),
  }
  fs.writeFileSync(path.join(root, 'docs', `lighthouse-${preset}.json`), JSON.stringify(summary, null, 2) + '\n')
  const a = summary.audits
  rows.push(`| ${preset === 'desktop' ? 'Desktop' : 'Mobile (4× CPU slowdown, slow 4G)'} | ${summary.scores.performance} | ${summary.scores.accessibility} | ${summary.scores['best-practices']} | ${summary.scores.seo} | ${a['first-contentful-paint'].display} | ${a['largest-contentful-paint'].display} | ${a['total-blocking-time'].display} | ${a['cumulative-layout-shift'].display} | ${a['speed-index'].display} |`)
}
const table = ['| Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed Index |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...rows].join('\n')
fs.writeFileSync(path.join(root, 'docs', 'lighthouse.md'), table + '\n')
console.log(table)

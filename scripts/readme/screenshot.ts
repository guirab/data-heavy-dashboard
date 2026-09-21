/**
 * Captures the README screenshot (docs/screenshot.png, 1400×900, light scheme) and the
 * Open Graph image (app/opengraph-image.png, 1200×630) from a served production build.
 * Usage: pnpm build && pnpm start -p 3100 &  then  pnpm readme:screenshot
 */
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.PERF_BASE ?? 'http://localhost:3100'
const ROOT = path.resolve(import.meta.dirname, '../..')

const browser = await chromium.launch()
try {
  for (const shot of [
    { file: path.join(ROOT, 'docs', 'screenshot.png'), width: 1400, height: 900 },
    { file: path.join(ROOT, 'app', 'opengraph-image.png'), width: 1200, height: 630 },
  ]) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height }, colorScheme: 'light', deviceScaleFactor: 1 })
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[role="gridcell"]', { timeout: 60_000 })
    await page.waitForTimeout(600) // chart animations
    await page.screenshot({ path: shot.file })
    console.log(`wrote ${path.relative(ROOT, shot.file)} (${shot.width}×${shot.height})`)
    await page.close()
  }
} finally {
  await browser.close()
}

import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** The columns file, with or without a cache-busting query string. */
export const COLUMNS = '**/data/v1/*/columns.bin.gz*'

/**
 * "No critical or serious violations" is the bar from the spec; moderate and minor
 * findings are printed so they stay visible, not silenced.
 */
export async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  const rest = results.violations.filter((v) => v.impact !== 'critical' && v.impact !== 'serious')
  if (rest.length) console.log(`[axe:${label}] ${rest.length} non-blocking: ${rest.map((v) => `${v.id}(${v.impact}) ×${v.nodes.length}`).join(', ')}`)
  expect(serious, `${label}: ${serious.map((v) => `${v.id}: ${v.help} — ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')}`).toEqual([])
}

export const gridReady = (page: Page) => page.waitForSelector('[role="gridcell"]', { timeout: 60_000 })
/** Our own alert, not Next's route announcer (which also has role="alert"). */
export const alertPanel = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)')
/** The "N of M lines match" announcement under the grid title. */
export const matchCount = (page: Page) => page.locator('[aria-live="polite"]').first()

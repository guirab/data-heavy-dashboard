/**
 * axe over the five designed states plus a keyboard-only walkthrough.
 * "No critical or serious violations" is the bar from the spec; moderate
 * and minor findings are printed so they stay visible, not silenced.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const COLUMNS = '**/data/v1/*/columns.bin.gz'

async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  const rest = results.violations.filter((v) => v.impact !== 'critical' && v.impact !== 'serious')
  if (rest.length) console.log(`[axe:${label}] ${rest.length} non-blocking: ${rest.map((v) => `${v.id}(${v.impact}) ×${v.nodes.length}`).join(', ')}`)
  expect(serious, `${label}: ${serious.map((v) => `${v.id}: ${v.help} — ${v.nodes[0]?.html.slice(0, 120)}`).join('\n')}`).toEqual([])
}

const gridReady = (page: Page) => page.waitForSelector('[role="gridcell"]', { timeout: 60_000 })
/** Our own alert, not Next's route announcer (which also has role="alert"). */
const alertPanel = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)')

test('ready state: grid, charts and filters', async ({ page }) => {
  await page.goto('/')
  await gridReady(page)
  await expect(page.getByRole('grid', { name: 'Budget lines' })).toBeVisible()
  await expect(page.locator('[aria-live="polite"]').first()).toContainText(/of 328,263 lines match/)
  await axe(page, 'ready')
})

test('loading state: progress bar while the slice downloads', async ({ page }) => {
  await page.route(COLUMNS, async (route) => {
    await new Promise((r) => setTimeout(r, 4000))
    await route.continue()
  })
  await page.goto('/')
  await expect(page.getByRole('progressbar', { name: 'Dataset download' })).toBeVisible()
  await axe(page, 'loading')
  await gridReady(page)
})

test('error state: network failure keeps the summary and offers retry', async ({ page }) => {
  let fail = true
  await page.route(COLUMNS, (route) => (fail ? route.abort('failed') : route.continue()))
  await page.goto('/')
  const alert = alertPanel(page)
  await expect(alert).toContainText('Could not download the dataset')
  // The pre-aggregated answer is still on screen above the error.
  await expect(page.getByText('Committed (empenhado)')).toBeVisible()
  await axe(page, 'error-network')
  fail = false
  await alert.getByRole('button', { name: 'Retry' }).click()
  await gridReady(page)
})

test('error state: checksum mismatch is reported as integrity, not network', async ({ page }) => {
  await page.route(COLUMNS, (route) => route.fulfill({ status: 200, contentType: 'application/gzip', body: Buffer.from([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3]) }))
  await page.goto('/')
  await expect(alertPanel(page)).toContainText('checksum')
  await axe(page, 'error-integrity')
})

test('empty-filter state names the filters and can undo the last one', async ({ page }) => {
  await page.goto('/?q=zzzzzzzz&org=26000')
  const status = page.getByRole('status')
  await status.waitFor({ timeout: 60_000 })
  await expect(status).toContainText('0 of 328,263 budget lines match')
  await expect(status).toContainText('Ministério da Educação')
  await axe(page, 'empty-filter')
  await status.getByRole('button', { name: 'Remove last filter' }).click()
  await expect(page.locator('[aria-live="polite"]').first()).toContainText(/129,443 of/)
})

test('partial-data state: partial year banner and the no-agency bucket', async ({ page }) => {
  await page.goto('/?year=2026')
  await gridReady(page)
  await expect(page.getByRole('note')).toContainText('2026 is a partial year')
  await expect(page.getByText(/lines match but have no agency/)).toBeVisible()
  await page.getByRole('button', { name: 'Include them' }).click()
  await expect(page.getByText(/are included in totals/)).toBeVisible()
  await axe(page, 'partial-data')
})

test('stale-data state: badge turns when the source is old', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-06-01T12:00:00Z'))
  await page.goto('/')
  await expect(page.getByText(/may be stale/)).toBeVisible()
  await gridReady(page)
  await axe(page, 'stale-data')
})

test('keyboard: filters → grid cells → sort → chart table view', async ({ page }) => {
  await page.goto('/')
  await gridReady(page)
  const grid = page.getByRole('grid', { name: 'Budget lines' })
  await grid.focus()
  // Focus lands on the active cell (row 1, col 1), then arrows move it.
  await expect(page.locator(':focus')).toHaveAttribute('role', 'gridcell')
  await expect(page.locator(':focus')).toHaveAttribute('data-r', '0')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator(':focus')).toHaveAttribute('data-r', '1')
  await expect(page.locator(':focus')).toHaveAttribute('data-c', '1')
  await page.keyboard.press('PageDown')
  await expect(page.locator(':focus')).toHaveAttribute('data-r', /^1[0-9]$/)
  await page.keyboard.press('Control+End')
  await expect(page.locator(':focus')).toHaveAttribute('data-r', String(315_755 - 1))
  await expect(grid).toHaveAttribute('aria-rowcount', String(315_755 + 1))
  await page.keyboard.press('Control+Home')
  // Sorting from the keyboard via the column header button.
  const paid = grid.getByRole('columnheader', { name: 'Paid' })
  await paid.getByRole('button').focus()
  await page.keyboard.press('Enter')
  await expect(paid).toHaveAttribute('aria-sort', 'descending')
  await expect(page).toHaveURL(/sort=pago%3Adesc/)
  // Charts expose a table view.
  await page.getByRole('button', { name: 'View as table' }).first().click()
  await expect(page.getByRole('table').first()).toBeVisible()
  await axe(page, 'chart-table-view')
})

test('keyboard: Tab and Shift+Tab leave the grid in both directions (no trap)', async ({ page }) => {
  await page.goto('/')
  await gridReady(page)
  const inGrid = () => page.evaluate(() => !!document.activeElement?.closest('[role="grid"]'))
  await page.getByRole('grid', { name: 'Budget lines' }).focus()
  await expect(page.locator(':focus')).toHaveAttribute('role', 'gridcell')
  // Backwards: real Shift+Tab presses must get out within a bounded number of keys
  // (the 15 sortable headers sit between the active cell and the container).
  let presses = 0
  while (await inGrid()) {
    expect(presses++, 'Shift+Tab never left the grid').toBeLessThan(20)
    await page.keyboard.press('Shift+Tab')
  }
  // Forwards: Tab re-enters on the active cell, and one more Tab leaves to the footer link.
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toHaveAttribute('role', 'gridcell')
  await expect(page.locator(':focus')).toHaveAttribute('data-r', '0')
  await page.keyboard.press('Tab')
  expect(await inGrid()).toBe(false)
  await expect(page.getByRole('link', { name: 'data dictionary' })).toBeFocused()
})

test('url state: an unknown sort key falls back to the default and the URL heals itself', async ({ page }) => {
  await page.goto('/?sort=nope:asc&months=3-9')
  await gridReady(page)
  await expect(page).toHaveURL(/months=3-9/)
  await expect(page).not.toHaveURL(/sort=/)
  await expect(page.getByRole('columnheader', { name: 'Gap' })).toHaveAttribute('aria-sort', 'descending')
  await expect(alertPanel(page)).toHaveCount(0)
})

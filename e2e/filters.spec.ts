/**
 * The filter controls are library widgets (shadcn over Base UI), not native elements,
 * so keyboard parity with a native <select> / checkbox is asserted here — with real
 * key presses — and axe runs while each popup is open.
 */
import { expect, test } from '@playwright/test'
import { axe, gridReady, matchCount } from './helpers'

test('select: keyboard opens, navigates, commits or cancels, and restores focus; axe clean while open', async ({ page }) => {
  await page.goto('/')
  await gridReady(page)
  await expect(page.getByRole('combobox', { name: 'Year' })).toContainText('2025')
  const from = page.getByRole('combobox', { name: 'From month' })
  await expect(from).toContainText('jan')
  await from.focus()
  await page.keyboard.press('ArrowDown') // opens on the selected item
  const list = page.getByRole('listbox', { name: 'From month' })
  await expect(list).toBeVisible()
  await expect(page.getByRole('option', { name: 'jan' })).toBeFocused()
  await axe(page, 'select-open')
  await page.keyboard.press('Escape') // closes without committing
  await expect(list).toBeHidden()
  await expect(from).toBeFocused()
  await expect(page).not.toHaveURL(/months=/)
  await page.keyboard.press('Space') // opens too
  await expect(list).toBeVisible()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: 'jun' })).toBeFocused()
  await page.keyboard.press('Enter') // commits
  await expect(list).toBeHidden()
  await expect(from).toBeFocused()
  await expect(from).toContainText('jun')
  await expect(page).toHaveURL(/months=6-12/)
  await expect(matchCount(page)).toContainText(/^(?!328,263 of).* of 328,263 lines match/)
  await page.keyboard.press('Tab') // the library's hidden form inputs are not tab stops
  await expect(page.getByRole('combobox', { name: 'To month' })).toBeFocused()
})

test('year select: choosing another year reloads that slice', async ({ page }) => {
  await page.goto('/')
  await gridReady(page)
  await page.getByRole('combobox', { name: 'Year' }).click()
  await page.getByRole('option', { name: '2024' }).click()
  await expect(page).toHaveURL(/year=2024/)
  await expect(page.getByRole('combobox', { name: 'Year' })).toContainText('2024')
  await gridReady(page)
  await expect(matchCount(page)).toContainText(/of 3\d\d,\d{3} lines match/)
})

test('dimension popover: checkbox toggles with Space and Escape keeps the filter; axe clean while open', async ({ page }) => {
  await page.goto('/')
  await gridReady(page)
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Agency/ }).click()
  await expect(page.getByRole('dialog', { name: 'Agency filter' })).toBeVisible()
  const cb = page.getByRole('checkbox', { name: 'Ministério da Educação' })
  await cb.focus()
  await page.keyboard.press('Space')
  await expect(cb).toBeChecked()
  await axe(page, 'dimension-open')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/org=26000/)
  await expect(matchCount(page)).toContainText(/129,443 of/)
  await expect(page.getByRole('button', { name: 'Agency, 1 selected' })).toBeVisible()
})

import { expect, test } from '@playwright/test'

test('keeps the cover picker size stable when its panel grows', { tag: ['@critical', '@webkit-smoke', '@firefox-smoke'] }, async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  const panel = page.getByRole('region', { name: '文章封面' })
  const picker = panel.locator('.file-button')
  const initial = await picker.boundingBox()
  expect(initial).not.toBeNull()
  await picker.hover()
  await picker.locator('input').focus()
  const focused = await picker.boundingBox()
  expect(Math.abs(focused!.height - initial!.height)).toBeLessThan(1)
  expect(Math.abs(focused!.width - initial!.width)).toBeLessThan(1)

  // A taller available panel must not distribute extra grid height to the
  // upload control when adjacent sections change size.
  await panel.evaluate((element) => { element.style.minHeight = '360px' })
  const expanded = await picker.boundingBox()
  expect(Math.abs(expanded!.height - initial!.height)).toBeLessThan(1)
  expect(Math.abs(expanded!.width - initial!.width)).toBeLessThan(1)
})

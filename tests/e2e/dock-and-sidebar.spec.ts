import { expect, test } from '@playwright/test'

test('attracts and merges the desktop Dock as the document scrolls', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => { document.body.style.minHeight = '240vh' })
  await page.evaluate(() => window.scrollTo(0, window.innerHeight))

  const dock = page.locator('.imx-dock')
  await expect(dock).toHaveClass(/is-dock-merged/)
  await expect.poll(() => dock.evaluate((element) => getComputedStyle(element).getPropertyValue('--home-dock-shell-opacity').trim())).toBe('1.000')
})

import { expect, test } from '@playwright/test'

test('attracts and merges the desktop Dock as the document scrolls', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => { document.body.style.minHeight = '240vh' })
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 0.45))

  const dock = page.locator('.imx-dock')
  await expect.poll(() => dock.evaluate((element) => Number.parseFloat(getComputedStyle(element).getPropertyValue('--home-dock-shell-opacity')))).toBeLessThan(0.35)
  await expect.poll(() => dock.evaluate((element) => Number.parseFloat(getComputedStyle(element).getPropertyValue('--home-dock-part-bg-alpha')))).toBeGreaterThan(0.65)
  await page.evaluate(() => window.scrollTo(0, window.innerHeight))

  await expect(dock).toHaveClass(/is-dock-merged/)
  await expect.poll(() => dock.evaluate((element) => getComputedStyle(element).getPropertyValue('--home-dock-shell-opacity').trim())).toBe('1.000')
})

test('collapses the settings sidebar, expands the editor, and restores the preference', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '文章', exact: true }).click()
  const workspace = page.getByRole('region', { name: '文章工作区' })
  const inspector = page.locator('.workspace-inspector')
  const editor = page.locator('.workspace-editor')
  const initial = await editor.boundingBox()
  expect(initial).not.toBeNull()
  expect(await inspector.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('none')

  const collapse = page.getByRole('button', { name: '折叠文章设置' })
  await collapse.click()
  await expect(workspace).toHaveAttribute('data-inspector-collapsed', 'true')
  await expect(page.getByRole('button', { name: '展开文章设置' })).toBeFocused()
  await expect.poll(async () => (await editor.boundingBox())?.width ?? 0).toBeGreaterThan((initial?.width ?? 0) + 220)
  await expect.poll(async () => (await inspector.boundingBox())?.width ?? -1).toBe(0)

  await page.reload()
  await page.getByRole('button', { name: '文章', exact: true }).click()
  await expect(page.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'true')
  await page.getByRole('button', { name: '展开文章设置' }).click()
  await expect(page.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'false')
})

test('uses the compact IMX menu and existing workspace tabs on mobile without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const toggle = page.getByRole('button', { name: '打开菜单' })
  await toggle.click()
  await expect(page.getByRole('button', { name: '关闭菜单' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: '文章', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '文章', exact: true }).click()

  await expect(page.getByRole('button', { name: '打开菜单' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('tab', { name: '设置' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '写作' })).toBeVisible()
  await expect(page.getByRole('button', { name: '折叠文章设置' })).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

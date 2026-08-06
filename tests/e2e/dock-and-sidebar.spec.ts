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

test('follows the system theme, persists a manual choice, and keeps the workspace action focused on preview', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const switchToLight = page.getByRole('button', { name: '切换到浅色主题' })
  await expect(switchToLight).toBeVisible()
  await expect(page.locator('.home-hero')).toHaveCSS('background-color', 'rgba(23, 23, 22, 0.82)')

  await switchToLight.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '切换到深色主题' }).click()

  await page.getByRole('button', { name: '文章', exact: true }).click()
  await expect(page.getByRole('button', { name: /切换到.*主题/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '预览文章' })).toBeVisible()
})

test('warns on browser exit only until the current changes reach the draft library', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '文章', exact: true }).click()
  const dirtyBeforeHome = await page.evaluate(async (title) => {
    const input = document.querySelector<HTMLInputElement>('#title')
    const home = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '首页')
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!input || !home || !setValue) throw new Error('Unable to prepare the dirty-home transition')

    setValue.call(input, title)
    input.dispatchEvent(new Event('input', { bubbles: true }))

    let mayLeave = true
    for (let attempt = 0; attempt < 10 && mayLeave; attempt += 1) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      mayLeave = window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
    }
    home.click()
    return !mayLeave
  }, '首页往返时仍在内存')

  expect(dirtyBeforeHome).toBe(true)
  await expect(page.getByRole('region', { name: 'IMX Post Studio 介绍' })).toBeVisible()
  expect(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false)

  await page.getByRole('button', { name: '文章', exact: true }).click()
  await expect(page.getByLabel('标题')).toHaveValue('首页往返时仍在内存')
  await expect(page.getByRole('status')).toContainText('已保存到本地草稿')
  expect(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true)
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

test('collapses the action rail, expands the editor, and restores it independently', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '文章', exact: true }).click()
  const workspace = page.getByRole('region', { name: '文章工作区' })
  const actions = page.locator('.workspace-actions')
  const settings = page.locator('#panel-settings')
  const editor = page.locator('.workspace-editor')
  const initial = await editor.boundingBox()
  expect(initial).not.toBeNull()
  await expect(actions.locator('.media-panel')).toBeVisible()
  await expect(actions.locator('.bundle-actions')).toBeVisible()
  await expect(settings.getByLabel('选择封面')).toBeVisible()
  await expect(actions.getByLabel('选择封面')).toHaveCount(0)
  await expect(actions.getByLabel('添加正文图片')).toBeVisible()
  expect(await actions.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('none')

  await page.getByRole('button', { name: '折叠文章操作' }).click()
  await expect(workspace).toHaveAttribute('data-actions-collapsed', 'true')
  await expect(workspace).toHaveAttribute('data-inspector-collapsed', 'false')
  await expect(page.getByRole('button', { name: '展开文章操作' })).toBeFocused()
  await expect.poll(async () => (await editor.boundingBox())?.width ?? 0).toBeGreaterThan((initial?.width ?? 0) + 150)
  await expect.poll(async () => (await actions.boundingBox())?.width ?? -1).toBe(0)

  await page.reload()
  await page.getByRole('button', { name: '文章', exact: true }).click()
  await expect(page.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-actions-collapsed', 'true')
  await expect(page.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'false')
})

test('synchronizes preview theme with the app and persists changes after closing', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: '文章', exact: true }).click()
  await page.getByRole('button', { name: '预览文章' }).click()

  await expect(page.locator('.preview-surface')).toHaveAttribute('data-theme', 'dark')
  await expect(page.frameLocator('iframe[title="IMX 文章预览"]').locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '浅色预览' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.frameLocator('iframe[title="IMX 文章预览"]').locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '返回编辑' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('attracts and merges the preview Dock as the preview surface scrolls', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '文章', exact: true }).click()
  await page.getByRole('button', { name: '预览文章' }).click()

  const surface = page.locator('.preview-surface')
  const dock = page.locator('.preview-dock')
  await surface.evaluate((element) => {
    const spacer = document.createElement('div')
    spacer.style.height = '200vh'
    spacer.setAttribute('aria-hidden', 'true')
    element.append(spacer)
    element.scrollTop = element.clientHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => surface.evaluate((element) => element.scrollTop / element.clientHeight)).toBeGreaterThanOrEqual(0.88)

  await expect(dock).toHaveClass(/is-dock-merged/)
  await expect.poll(() => dock.evaluate((element) => getComputedStyle(element).getPropertyValue('--home-dock-shell-opacity').trim())).toBe('1.000')
})

test('keeps preview Dock merging responsive and reduced-motion safe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: '文章', exact: true }).click()
  await page.getByRole('button', { name: '预览文章' }).click()
  const surface = page.locator('.preview-surface')
  const dock = page.locator('.preview-dock')

  await surface.evaluate((element) => {
    const spacer = document.createElement('div')
    spacer.style.height = '200vh'
    spacer.setAttribute('aria-hidden', 'true')
    element.append(spacer)
    element.scrollTop = element.clientHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => surface.evaluate((element) => element.scrollTop / element.clientHeight)).toBeGreaterThanOrEqual(0.88)
  await expect(dock).toHaveClass(/is-dock-merged/)
  await expect(dock).not.toHaveClass(/is-dock-attracting/)

  await page.setViewportSize({ width: 390, height: 844 })
  await surface.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await expect(dock).not.toHaveClass(/is-dock-merged/)
  expect(await surface.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
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
  await expect(page.getByRole('button', { name: '折叠文章操作' })).toBeHidden()
  await expect(page.getByRole('button', { name: '新建文章' })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存到草稿库' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '媒体' })).toBeVisible()
  await expect(page.locator('#panel-settings').getByRole('heading', { name: '文章封面' })).toBeVisible()
  await expect(page.locator('#panel-settings').getByLabel('选择封面')).toBeVisible()
  await expect(page.locator('#panel-actions').getByLabel('选择封面')).toHaveCount(0)
  await expect(page.locator('#panel-actions').getByLabel('添加正文图片')).toBeVisible()
  await expect(page.getByRole('button', { name: '导入 ZIP' })).toBeVisible()
  await page.getByRole('tab', { name: '写作' }).click()
  await expect(page.locator('#panel-actions')).toBeHidden()
  await expect(page.locator('#panel-write')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

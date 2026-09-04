import { expect, test } from '@playwright/test'
import { setEditorMode } from '../helpers/editor-mode'

test('renders settings checkboxes consistently on mobile browsers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '打开设置' }).click()

  const checkbox = page.getByRole('checkbox', { name: /新文章默认设为精选/ })
  await expect(checkbox).toBeVisible()
  await expect(checkbox).not.toBeChecked()
  await expect(checkbox).toHaveCSS('appearance', 'none')
  await expect(checkbox).toHaveCSS('box-shadow', 'none')
  expect(await checkbox.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { width: bounds.width, height: bounds.height }
  })).toEqual({ width: 18, height: 18 })

  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await expect(checkbox).toHaveCSS('background-color', 'rgb(122, 90, 50)')
  await expect.poll(() => checkbox.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe('none')
})

test('keeps the reset-settings action visually secondary', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('tab', { name: '安全与数据' }).click()

  const resetCard = page.locator('.settings-reset')
  const reset = page.getByRole('button', { name: '恢复默认设置' })
  await expect(reset).toHaveCSS('border-radius', '999px')
  await expect(reset).toHaveCSS('box-shadow', 'none')
  await expect(reset).toHaveCSS('background-color', 'rgba(122, 90, 50, 0.08)')
  expect((await reset.boundingBox())!.width).toBeLessThan((await resetCard.boundingBox())!.width / 2)

  await reset.click()
  await expect(page.getByRole('alert')).toContainText('再次确认后立即恢复默认值')
  await expect(page.getByRole('button', { name: '确认重置' })).toHaveCSS('background-color', 'rgb(249, 238, 234)')
  await expect(page.getByRole('button', { name: '取消' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

test('keeps a single complete I M P S logo before, during and after hovering', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const brand = page.getByRole('button', { name: 'I M P S，返回首页' })
  await expect(brand.locator('svg')).toHaveCount(1)
  const strokes = brand.locator('.imx-dock__logo path')
  await expect(strokes).toHaveCount(6)
  for (const hovered of [false, true, false, true]) {
    if (hovered) await brand.hover()
    else await page.mouse.move(700, 500)
    await expect(brand.locator('.imx-dock__logo')).toHaveCSS('opacity', '0.92')
    expect(await strokes.evaluateAll((paths) => paths.every((path) =>
      getComputedStyle(path).strokeDasharray === 'none' && getComputedStyle(path).animationName === 'none',
    ))).toBe(true)
  }
  await brand.screenshot({ path: testInfo.outputPath('logo-hover.png') })
  await page.mouse.move(700, 500)
  await expect(brand.locator('.imx-dock__logo')).toHaveCSS('opacity', '0.92')
})

test('keeps formatting controls compact after resizing and reopening the rail', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  const rail = page.locator('#panel-actions')
  await rail.getByRole('tab', { name: '排版', exact: true }).click()
  const buttons = rail.locator('.editor-toolbar button')
  const checkHeights = async () => {
    await expect(buttons.first()).toBeVisible()
    expect(await buttons.evaluateAll((items) => items.every((item) =>
      Math.abs(item.getBoundingClientRect().height - 40) < 1,
    ))).toBe(true)
  }
  for (const width of [1440, 1117, 1280]) {
    await page.setViewportSize({ width, height: 763 })
    await page.getByRole('button', { name: '折叠文章操作' }).click()
    await expect.poll(async () => (await rail.boundingBox())?.width).toBe(0)
    await page.getByRole('button', { name: '展开文章操作' }).click()
    await expect.poll(async () => (await rail.boundingBox())?.width ?? 0).toBeGreaterThan(270)
    await checkHeights()
    await buttons.first().hover()
    await checkHeights()
  }
  await page.setViewportSize({ width: 390, height: 763 })
  await page.getByRole('tab', { name: '工具', exact: true }).click()
  await checkHeights()
  expect(await rail.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})

test('follows the system theme and keeps theme switching in the Dock on the workspace', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const switchToLight = page.getByRole('button', { name: '切换到浅色主题' })
  await expect(switchToLight).toBeVisible()
  await expect(page.locator('.home-hero')).toHaveCSS('background-color', 'rgba(23, 23, 22, 0.76)')

  await switchToLight.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '切换到深色主题' }).click()

  await page.getByRole('button', { name: '写作', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Studio 导航' }).getByRole('button', { name: '切换到浅色主题' })).toBeVisible()
  await expect(page.locator('#panel-actions').getByRole('button', { name: '预览文章' })).toBeVisible()
})

test('smoothly hides and restores the Dock while expanding the writing area', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()

  const app = page.locator('.app-shell')
  const dock = page.locator('.imx-dock')
  const editor = page.locator('.workspace-editor')
  const status = page.getByRole('status')
  const initialHeight = (await editor.boundingBox())?.height ?? 0
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('尚未命名的内容')
  await expect(status).toHaveText('文章未命名，未保存至本地草稿')

  await page.getByRole('button', { name: '隐藏 Dock' }).click()
  await expect(app).toHaveAttribute('data-dock-hidden', 'true')
  await expect(dock).toHaveAttribute('data-hidden', 'true')
  await expect(status).toHaveText('Dock已隐藏')
  await expect.poll(async () => (await editor.boundingBox())?.height ?? 0).toBeGreaterThan(initialHeight + 50)

  await page.getByRole('button', { name: '恢复 Dock' }).click()
  await expect(app).not.toHaveAttribute('data-dock-hidden')
  await expect(dock).not.toHaveAttribute('data-hidden')
  await expect(status).toHaveText('Dock已恢复')
  await expect.poll(async () => Math.abs(((await editor.boundingBox())?.height ?? 0) - initialHeight)).toBeLessThan(2)
})

test('warns on browser exit only until the current changes reach the draft library', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
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
  await expect(page.getByRole('region', { name: 'I M P S 介绍' })).toBeVisible()
  expect(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false)

  await page.getByRole('button', { name: '写作', exact: true }).click()
  await expect(page.getByLabel('标题')).toHaveValue('首页往返时仍在内存')
  await expect(page.getByRole('status')).toContainText('文章编辑器已打开')
  expect(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false)
})

test('collapses the settings sidebar, expands the editor, and restores the preference', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
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
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await expect(page.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'true')
  await page.getByRole('button', { name: '展开文章设置' }).click()
  await expect(page.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'false')
})

test('collapses the action rail, expands the editor, and restores it independently', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
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
  await actions.getByRole('tab', { name: '排版' }).click()
  await expect(actions.getByLabel('添加正文图片')).toBeHidden()
  await actions.getByRole('tab', { name: '文档' }).click()
  for (const property of ['background-color', 'border-top-width', 'border-top-left-radius', 'box-shadow', 'padding-top']) {
    await expect(actions).toHaveCSS(property, await settings.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property))
  }
  expect(await actions.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('none')

  await page.getByRole('button', { name: '折叠文章操作' }).click()
  await expect(workspace).toHaveAttribute('data-actions-collapsed', 'true')
  await expect(workspace).toHaveAttribute('data-inspector-collapsed', 'false')
  await expect(page.getByRole('button', { name: '展开文章操作' })).toBeFocused()
  await expect.poll(async () => (await editor.boundingBox())?.width ?? 0).toBeGreaterThan((initial?.width ?? 0) + 150)
  await expect.poll(async () => (await actions.boundingBox())?.width ?? -1).toBe(0)

  await page.reload()
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await expect(page.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-actions-collapsed', 'true')
  await expect(page.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'false')
  for (const width of [1117, 390]) {
    await page.setViewportSize({ width, height: 763 })
    if (width > 1023) {
      await page.getByRole('button', { name: '展开文章操作' }).click()
    } else {
      await page.getByRole('tab', { name: '工具', exact: true }).click()
    }
    await expect(actions).toBeVisible()
    if (width > 1023) {
      await expect.poll(async () => Math.abs((await actions.boundingBox())!.width - (await settings.boundingBox())!.width)).toBeLessThan(1)
      await expect(actions.getByRole('tab', { name: '文档' })).toHaveCSS('white-space', 'nowrap')
    }
    await expect(actions).toHaveCSS('border-top-left-radius', await settings.evaluate((element) => getComputedStyle(element).borderTopLeftRadius))
    await expect.poll(() => actions.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  }
})

test('synchronizes preview theme with the app and persists changes after closing', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await page.getByRole('button', { name: '预览文章' }).click()

  await expect(page.locator('.preview-surface')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByTitle('IMX 文章预览').locator('.preview-html')).toHaveAttribute('data-theme', 'dark')
  await page.locator('.preview-surface').getByRole('button', { name: '切换到浅色主题' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByTitle('IMX 文章预览').locator('.preview-html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '返回编辑' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('fits the complete preview canvas and Dock without horizontal scrolling at intermediate widths', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await page.getByLabel('标题').fill('中间尺寸预览')
  await page.getByLabel('Slug').fill('intermediate-preview-widths')
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('## 第一节\n\n正文。\n\n## 第二节\n\n更多正文。')
  await page.getByRole('button', { name: '预览文章' }).click()

  for (const width of [760, 900, 1024, 1180]) {
    await page.setViewportSize({ width, height: 700 })
    const canvas = page.locator('.preview-viewport')
    const frame = page.getByTitle('IMX 文章预览')
    const dock = page.locator('.preview-dock__container')
    await expect.poll(() => canvas.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    expect(await frame.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= window.innerWidth
    })).toBe(true)
    expect(await dock.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= window.innerWidth
    })).toBe(true)
  }
})

test('uses the compact IMX menu and existing workspace tabs on mobile without overflow', async ({ page }) => {
  await page.goto('/')
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width > 768) {
      const brand = await page.locator('.imx-dock__brand').boundingBox()
      const menu = await page.locator('.imx-dock__menu').boundingBox()
      expect(brand!.x + brand!.width).toBeLessThanOrEqual(menu!.x)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const toggle = page.getByRole('button', { name: '打开菜单' })
  await toggle.click()
  await expect(page.getByRole('button', { name: '关闭菜单' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: '写作', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '写作', exact: true }).click()

  await expect(page.getByRole('button', { name: '打开菜单' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('tab', { name: '设置', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '写作' })).toBeVisible()
  await expect(page.getByRole('button', { name: '折叠文章设置' })).toBeHidden()
  await expect(page.getByRole('button', { name: '折叠文章操作' })).toBeHidden()
  await expect(page.locator('#panel-settings').getByRole('heading', { name: '文章封面' })).toBeVisible()
  await expect(page.locator('#panel-settings').getByLabel('选择封面')).toBeVisible()
  await page.getByRole('tab', { name: '工具', exact: true }).click()
  await expect(page.getByRole('button', { name: '新建文章' })).toBeVisible()
  await expect(page.getByRole('button', { name: '推送' })).toBeVisible()
  await expect(page.getByRole('button', { name: '导入文章包' })).toBeVisible()
  await page.getByRole('tab', { name: '文档' }).click()
  await expect(page.getByRole('heading', { name: '正文图片' })).toBeVisible()
  await expect(page.locator('#panel-actions').getByLabel('选择封面')).toHaveCount(0)
  await expect(page.locator('#panel-actions').getByLabel('添加正文图片')).toBeVisible()
  await page.getByRole('tab', { name: '写作' }).click()
  await expect(page.locator('#panel-actions')).toBeHidden()
  await expect(page.locator('#panel-write')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('formats the selected text from the right sidebar without resetting the editor', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  const actions = page.locator('#panel-actions')
  const status = page.locator('.editor-save-status')
  await expect(status).toHaveCSS('text-align', 'center')
  await expect(status).toHaveAttribute('data-tone', 'info')
  const infoColor = await status.evaluate((element) => getComputedStyle(element).color)
  await editor.fill('保留选区')
  await expect(status).toHaveAttribute('data-tone', 'error')
  await expect(status).toHaveText('文章未命名，未保存至本地草稿')
  expect(await status.evaluate((element) => getComputedStyle(element).color)).not.toBe(infoColor)
  await editor.press('ControlOrMeta+a')
  await actions.getByRole('tab', { name: '排版' }).click()
  await expect(page.locator('#panel-write').locator('.editor-toolbar')).toHaveCount(0)
  await actions.getByRole('button', { name: '加粗', exact: true }).click()
  await expect(editor.locator('strong')).toHaveCount(0)
  await expect(editor).toContainText('**保留选区**')
  await expect(actions.getByRole('button', { name: '加粗', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await editor.locator('p').last().click()
  await editor.pressSequentially('普通输入')
  await expect(editor.locator('strong')).toHaveText('保留选区')
  await expect(editor.locator('strong')).not.toContainText('普通输入')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: '写作', exact: true }).click()
  await expect(status).toHaveCSS('text-align', 'center')
  for (const name of ['撤销', '重做']) {
    const historyButton = page.getByRole('button', { name, exact: true })
    await expect(historyButton).toBeVisible()
    expect(await historyButton.evaluate((element) => getComputedStyle(element).color)).not.toBe('rgba(0, 0, 0, 0)')
    expect((await historyButton.boundingBox())?.width).toBeGreaterThanOrEqual(50)
  }
  await editor.locator('strong').evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await page.getByRole('tab', { name: '工具', exact: true }).click()
  await expect(actions.getByRole('button', { name: '斜体' })).toBeVisible()
  expect(await actions.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await actions.getByRole('button', { name: '斜体' }).click()
  await expect(editor).toBeVisible()
  await expect(editor).toContainText('*保留选区*')
  await expect(editor.locator('strong')).toHaveText('保留选区')
  await expect(editor.locator('em')).toHaveCount(0)
  await editor.locator('p').filter({ hasText: '普通输入' }).click()
  await expect(editor.locator('strong em')).toHaveText('保留选区')
  await setEditorMode(page, 'source')
  await expect(page.locator('.cm-line').first()).toContainText('保留选区')
  await setEditorMode(page, 'rich')
  await expect(editor.locator('em')).toHaveText('保留选区')
})

test('inserts, edits and removes links from the sidebar on desktop and mobile', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill('链接文字')
  await editor.press('ControlOrMeta+a')
  await page.getByRole('tab', { name: '排版', exact: true }).click()
  const linkButton = page.getByRole('button', { name: '链接', exact: true })
  await linkButton.click()
  await expect(page.getByRole('dialog', { name: '插入链接' })).toBeVisible()
  await expect(page.getByLabel('链接文字')).toHaveValue('链接文字')
  await page.getByLabel('链接地址').fill('https://example.com')
  await page.getByRole('button', { name: '插入链接', exact: true }).click()
  await expect(editor.getByRole('link')).toHaveAttribute('href', 'https://example.com')
  await editor.getByRole('link').click()
  await linkButton.click()
  await expect(page.getByRole('dialog', { name: '编辑链接' })).toBeVisible()
  await page.getByLabel('链接地址').fill('https://example.com/changed')
  await page.getByRole('button', { name: '保存链接' }).click()
  await expect(editor.getByRole('link')).toHaveAttribute('href', 'https://example.com/changed')
  await editor.press('ControlOrMeta+z')
  await expect(editor.getByRole('link')).toHaveAttribute('href', 'https://example.com')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: '写作', exact: true }).click()
  await editor.getByRole('link').click()
  await page.getByRole('tab', { name: '工具', exact: true }).click()
  await linkButton.click()
  await expect(page.getByLabel('链接地址')).toHaveValue('https://example.com')
  await page.getByRole('button', { name: '移除链接' }).click()
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('link')).toHaveCount(0)
  await expect(editor).toHaveText('链接文字')
})

test('keeps the preview table of contents controllable on desktop and mobile without navigating away', { tag: ['@critical', '@webkit-smoke'] }, async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await page.getByLabel('标题').fill('目录交互回归')
  await page.getByLabel('Slug').fill('preview-toc-controls')
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('## 第一节\n\n正文。\n\n### 第二节\n\n更多正文。')
  await page.getByRole('button', { name: '预览文章' }).click()

  const preview = page.getByTitle('IMX 文章预览')
  const sidebar = preview.locator('#article-toc')
  const desktopToggle = preview.getByRole('checkbox', { name: '目录' })
  const titleAndBodyLefts = () => preview.locator('.article-page').evaluate((article) => {
    const title = article.querySelector('.article-title')
    const content = article.querySelector('.article-content')
    if (!title || !content) throw new Error('Preview title or article content is missing')
    return {
      title: title.getBoundingClientRect().left,
      body: content.getBoundingClientRect().left,
    }
  })
  await expect(desktopToggle).toBeVisible()
  await expect(desktopToggle).not.toBeChecked()
  await expect(sidebar).toBeVisible()
  const expandedLefts = await titleAndBodyLefts()
  expect(Math.abs(expandedLefts.title - expandedLefts.body)).toBeLessThanOrEqual(1)
  expect(await desktopToggle.evaluate((toggle) => {
    const bounds = toggle.getBoundingClientRect()
    return {
      rightGap: ((toggle.getRootNode() as ShadowRoot).host as HTMLElement).getBoundingClientRect().right - bounds.right,
      width: bounds.width,
      height: bounds.height,
    }
  })).toEqual({ rightGap: 32, width: 50, height: 50 })

  await desktopToggle.click()
  await expect(desktopToggle).toBeChecked()
  await expect(sidebar).toBeHidden()
  const collapsedLefts = await titleAndBodyLefts()
  expect(Math.abs(collapsedLefts.title - collapsedLefts.body)).toBeLessThanOrEqual(1)
  expect(await preview.locator('.main-content').evaluate((content) => {
    const bounds = content.getBoundingClientRect()
    const hostBounds = ((content.getRootNode() as ShadowRoot).host as HTMLElement).getBoundingClientRect()
    return Math.abs(bounds.left + bounds.width / 2 - (hostBounds.left + hostBounds.width / 2))
  })).toBeLessThan(2)

  await desktopToggle.click()
  await expect(desktopToggle).not.toBeChecked()
  await expect(sidebar).toBeVisible()
  await preview.getByRole('link', { name: '第一节', exact: true }).click()
  const afterDirectoryLink = await preview.locator('.preview-body').evaluate((body) => ({
    articleVisible: body.querySelector('.article-page')?.getBoundingClientRect().height ?? 0,
    targetTop: (body.querySelector('#imx-heading-第一节')?.getBoundingClientRect().top ?? -1) - ((body.getRootNode() as ShadowRoot).host as HTMLElement).getBoundingClientRect().top,
    viewportHeight: ((body.getRootNode() as ShadowRoot).host as HTMLElement).clientHeight,
  }))
  expect(afterDirectoryLink.articleVisible).toBeGreaterThan(0)
  expect(afterDirectoryLink.targetTop).toBeGreaterThanOrEqual(0)
  expect(afterDirectoryLink.targetTop).toBeLessThan(afterDirectoryLink.viewportHeight)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(preview.locator('.preview-html')).toHaveAttribute('data-preview-viewport', 'mobile')
  const mobileToggle = preview.getByRole('checkbox', { name: '目录' })
  await expect(mobileToggle).toBeVisible()
  await expect(mobileToggle).not.toBeChecked()
  await expect(sidebar).toBeHidden()
  expect(await mobileToggle.evaluate((toggle) => {
    const bounds = toggle.getBoundingClientRect()
    return { width: bounds.width, height: bounds.height }
  })).toEqual({ width: 46, height: 46 })
  await mobileToggle.click()
  await expect(mobileToggle).toBeChecked()
  await expect(sidebar).toBeVisible()
  await expect(preview.locator('.article-content')).toContainText('更多正文。')
})

test('preserves the preview reading position, follows the active directory entry, and hides scrollbars', async ({ page, browserName }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await page.getByLabel('标题').fill('目录滚动回归')
  await page.getByLabel('Slug').fill('preview-scroll-follow')
  const sections = Array.from({ length: 32 }, (_, index) => (
    `## 第 ${index + 1} 节\n\n${'用于撑开文章高度的正文。'.repeat(8)}`
  )).join('\n\n')
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill(sections)
  await page.getByRole('button', { name: '预览文章' }).click()

  const preview = page.getByTitle('IMX 文章预览')
  const targetHeading = preview.getByRole('heading', { name: '第 28 节', exact: true })
  await targetHeading.evaluate((heading) => {
    const host = (heading.getRootNode() as ShadowRoot).host as HTMLElement
    host.scrollTop += heading.getBoundingClientRect().top - host.getBoundingClientRect().top
  })
  await expect.poll(() => preview.evaluate((host) => host.scrollTop)).toBeGreaterThan(0)

  const activeLink = preview.getByRole('link', { name: '第 28 节', exact: true })
  await expect(activeLink).toHaveClass(/active/)
  await expect(activeLink).toBeInViewport()
  const expectDirectoryInsideViewport = () => expect.poll(() => preview.evaluate((host) => {
    const toc = host.shadowRoot!.querySelector('.toc')!.getBoundingClientRect()
    const bounds = host.getBoundingClientRect()
    return { topInside: toc.top >= bounds.top - 1, bottomInside: toc.bottom <= bounds.bottom + 1 }
  })).toEqual({ topInside: true, bottomInside: true })
  await expectDirectoryInsideViewport()
  await expect.poll(() => activeLink.evaluate((link) => {
    const linkBounds = link.getBoundingClientRect()
    const tocBounds = link.closest('.toc')?.getBoundingClientRect()
    return Boolean(tocBounds && linkBounds.top >= tocBounds.top && linkBounds.bottom <= tocBounds.bottom)
  })).toBe(true)

  const bounds = await preview.boundingBox()
  if (!bounds) throw new Error('Preview bounds are missing')
  await page.mouse.move(bounds.x + 100, bounds.y + 180)
  for (const delta of [-500, 900, -600, 300]) {
    const before = await preview.evaluate((host) => host.scrollTop)
    await page.mouse.wheel(0, delta)
    await expect.poll(() => preview.evaluate((host) => host.scrollTop)).not.toBe(before)
    await expectDirectoryInsideViewport()
  }

  const toc = preview.locator('.toc')
  await toc.hover()
  // Firefox keeps a wheel transaction latched to the previous scroll target.
  // Let that gesture end before testing an independent gesture over the TOC.
  if (browserName === 'firefox') await page.waitForTimeout(1600)
  const articleScroll = await preview.evaluate((host) => host.scrollTop)
  for (const delta of [-120, 120]) {
    const before = await toc.evaluate((element) => element.scrollTop)
    await page.mouse.wheel(0, delta)
    await expect.poll(() => toc.evaluate((element) => element.scrollTop)).not.toBe(before)
    expect(await preview.evaluate((host) => host.scrollTop)).toBe(articleScroll)
    await expectDirectoryInsideViewport()
  }

  const toggle = preview.getByRole('checkbox', { name: '目录' })
  await toggle.click()
  await expect(toc).toBeHidden()
  await toggle.click()
  await expectDirectoryInsideViewport()
  const scrollBeforeThemeChange = await preview.evaluate((host) => host.scrollTop)

  await page.locator('.preview-surface').getByRole('button', { name: '切换到深色主题' }).click()
  await expect(preview.locator('.preview-html')).toHaveAttribute('data-theme', 'dark')
  await page.waitForTimeout(500)
  await expect.poll(() => preview.evaluate((host) => host.scrollTop)).toBe(scrollBeforeThemeChange)
  await expectDirectoryInsideViewport()

  expect(await preview.evaluate((host) => ({
    firefox: getComputedStyle(host).scrollbarWidth,
    webkit: getComputedStyle(host, '::-webkit-scrollbar').display,
  }))).toEqual({ firefox: 'none', webkit: 'none' })
})

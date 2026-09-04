import { expect, test } from '@playwright/test'
import { pngFile } from '../helpers/test-images'

test.use({ hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '开始写文章' }).click()
})

test('places four equally compact controls above the phone status text', async ({ page }, testInfo) => {
  const bar = page.locator('.editor-status-bar')
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill('用于检查长状态提示')
  for (const width of [320, 390, 430, 720]) {
    await page.setViewportSize({ width, height: 844 })
    const boxes = await Promise.all(['属性', '文档', '撤销', '重做'].map(async (name) => (await bar.getByRole('button', { name, exact: true }).boundingBox())!))
    for (const box of boxes) {
      expect(Math.abs(box.height - 30)).toBeLessThan(1)
      expect(Math.abs(box.width - boxes[0].width)).toBeLessThan(1)
      expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(1)
    }
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width)
    const status = (await bar.getByRole('status').boundingBox())!
    expect(status.y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height)
    expect(await bar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await bar.screenshot({ path: testInfo.outputPath('compact-mobile-controls.png') })
})

test('matches the phone navigation elevation to the content cards in either theme', async ({ page }, testInfo) => {
  const surface = page.locator('#studio-dock .imx-dock__container')
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toBeVisible()
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
      await page.getByRole('button', { name: theme === 'light' ? '切换到浅色主题' : '切换到深色主题' }).click()
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(surface).toHaveCSS('border-radius', '22px')
    await expect(surface).toHaveCSS('border-top-width', '1px')
    const panel = page.locator('.workspace-editor')
    await expect(surface).toHaveCSS('box-shadow', await panel.evaluate((element) => getComputedStyle(element).boxShadow))
    await expect(surface).toHaveCSS('background-color', await panel.evaluate((element) => getComputedStyle(element).backgroundColor))
    const dockBox = (await surface.boundingBox())!
    const panelBox = (await panel.boundingBox())!
    expect(Math.abs(dockBox.x - panelBox.x)).toBeLessThan(1)
    expect(Math.abs(dockBox.width - panelBox.width)).toBeLessThan(1)
    await expect(surface).toHaveCSS('backdrop-filter', 'none')
    await expect(page.locator('#studio-dock .imx-dock__actions')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await page.screenshot({ path: testInfo.outputPath(`framed-mobile-dock-${theme}.png`) })
  }
  await page.getByRole('button', { name: 'I M P S，返回首页' }).click()
  const hero = page.locator('.home-hero')
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
      await page.getByRole('button', { name: theme === 'light' ? '切换到浅色主题' : '切换到深色主题' }).click()
    }
    await expect(surface).toHaveCSS('box-shadow', await hero.evaluate((element) => getComputedStyle(element).boxShadow))
    await page.screenshot({ path: testInfo.outputPath(`home-mobile-dock-${theme}.png`) })
  }
})

test('keeps the phone Dock in document flow instead of following page scroll', async ({ page }) => {
  await page.getByRole('button', { name: 'I M P S，返回首页' }).click()
  const dock = page.locator('#studio-dock')
  await expect(dock).toHaveCSS('position', 'relative')
  const initial = (await dock.boundingBox())!
  await page.evaluate(() => window.scrollTo(0, 200))
  await expect.poll(async () => (await dock.boundingBox())!.y).toBeLessThan(0)
  expect(await dock.evaluate((element) => Math.abs(element.getBoundingClientRect().top + scrollY - 10))).toBeLessThan(2)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect.poll(async () => Math.abs((await dock.boundingBox())!.y - initial.y)).toBeLessThan(2)
  await page.getByRole('button', { name: '打开菜单' }).click()
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await expect(page.locator('.markdown-editor')).toBeVisible()
  expect((await page.locator('.workspace-editor').boundingBox())!.y).toBeGreaterThanOrEqual((await dock.boundingBox())!.y + (await dock.boundingBox())!.height)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(dock).toHaveCSS('position', 'fixed')
})

test('keeps the Dock horizontally aligned through restore and orientation changes @critical @webkit-smoke @firefox-smoke', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const dock = page.locator('#studio-dock')
  const assertAligned = async () => {
    // Viewport changes also trigger React's mobile layout subscription.
    await expect.poll(() => dock.evaluate((element) => {
      const dock = element.getBoundingClientRect()
      const panel = document.querySelector('.workspace-editor')!.getBoundingClientRect()
      return Math.max(Math.abs(dock.x - panel.x), Math.abs(dock.width - panel.width))
    })).toBeLessThan(1)
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport)
    await assertAligned()
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.getByRole('button', { name: '隐藏 Dock', exact: true }).click()
      await expect(dock).toHaveCSS('visibility', 'hidden')
      await page.getByRole('button', { name: '恢复 Dock', exact: true }).click()
      await expect(dock).toHaveCSS('height', '64px')
      await assertAligned()
      await expect(page.getByRole('button', { name: 'I M P S，返回首页' })).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: '打开菜单' })).toBeInViewport({ ratio: 1 })
    }
  }
  await page.screenshot({ path: testInfo.outputPath('mobile-dock-restored.png') })
  // Desktop/tablet still center the fixed Dock; mobile must not inherit an offset.
  for (const width of [800, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(dock).toHaveCSS('position', 'fixed')
    expect(await dock.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return Math.abs(box.x + box.width / 2 - innerWidth / 2)
    })).toBeLessThan(1)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await assertAligned()
})

test('fills the phone viewport and grows with the Dock hidden without a blank page tail', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const panel = page.locator('.workspace-editor')
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill('保持正文和光标')
  const assertFilled = async () => {
    await expect.poll(() => panel.evaluate((element) => Math.abs(innerHeight - element.getBoundingClientRect().bottom))).toBeLessThan(2)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1)
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await assertFilled()
    const initial = (await panel.boundingBox())!
    await page.getByRole('button', { name: '隐藏 Dock', exact: true }).click()
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(initial.height + 65)
    await assertFilled()
    const expanded = (await panel.boundingBox())!
    expect(Math.abs(expanded.height - initial.height - (initial.y - expanded.y))).toBeLessThan(2)
    await page.getByRole('button', { name: '恢复 Dock', exact: true }).click()
    await expect.poll(async () => Math.abs((await panel.boundingBox())!.height - initial.height)).toBeLessThan(2)
    await assertFilled()
    await expect(editor).toHaveText('保持正文和光标')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '隐藏 Dock', exact: true }).click()
  await assertFilled()
  await expect(page.locator('#studio-dock')).toHaveCSS('visibility', 'hidden')
  await expect.poll(async () => (await panel.boundingBox())!.y).toBeLessThan(11)
  await page.screenshot({ path: testInfo.outputPath('mobile-dock-hidden-height.png') })
  await editor.fill(Array.from({ length: 80 }, (_, i) => `第 ${i + 1} 行`).join('\n'))
  await editor.press('ControlOrMeta+End')
  await editor.press('Enter')
  await editor.pressSequentially('末行可继续输入')
  await expect(editor).toContainText('末行可继续输入')
  await assertFilled()
  expect(await editor.evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom))).toBeLessThan(40)
})

test('enforces source mode on phones without changing the desktop preference', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await expect(page.locator('.markdown-editor')).toHaveAttribute('data-mode', 'source')
  await editor.fill('****\n<sub>2</sub>\n**保留正文**')
  await page.getByRole('button', { name: '打开设置' }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('tab', { name: '编辑器' }).click()
  await expect(settings.getByRole('radio', { name: /即时排版/ })).toBeDisabled()
  await expect(settings.getByRole('radio', { name: /即时排版/ })).not.toBeChecked()
  await expect(settings.getByRole('radio', { name: /源代码/ })).toBeChecked()
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(editor).toContainText('****')
  await expect(editor).toContainText('<sub>2</sub>')
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.locator('.markdown-editor')).toHaveAttribute('data-mode', 'source')
  await expect(page.getByRole('button', { name: '文档', exact: true })).toBeVisible()
  await expect(editor).toContainText('**保留正文**')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('.markdown-editor')).toHaveAttribute('data-mode', 'rich')
  await page.getByRole('button', { name: '打开设置' }).click()
  await settings.getByRole('tab', { name: '编辑器' }).click()
  await expect(settings.getByRole('radio', { name: /即时排版/ })).toBeEnabled()
  await expect(settings.getByRole('radio', { name: /即时排版/ })).toBeChecked()
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.markdown-editor')).toHaveAttribute('data-mode', 'source')
  await expect(editor).toContainText('**保留正文**')
})

test('opens only properties and document tools from the status bar, preserving content and focus', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill('前文后文')
  await editor.press('ControlOrMeta+Home')
  await editor.press('ArrowRight')
  await editor.press('ArrowRight')
  const tools = page.locator('.editor-status-bar').getByRole('group', { name: '写作工具' })
  await expect(tools.getByRole('button')).toHaveCount(2)
  await expect(page.getByRole('tablist', { name: '工作区视图' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '排版' })).toHaveCount(0)
  await tools.getByRole('button', { name: '属性', exact: true }).click()
  const properties = page.getByRole('dialog', { name: '属性', exact: true })
  await properties.getByLabel('标题', { exact: true }).fill('手机写作测试')
  await properties.getByLabel('Slug', { exact: true }).fill('phone-writing')
  await expect(properties.getByRole('tab', { name: '大纲' })).toHaveCount(0)
  const featured = properties.getByRole('checkbox', { name: '精选文章' })
  await expect(featured).toHaveCSS('width', '18px')
  await expect(featured).toHaveCSS('height', '18px')
  await expect(featured).toHaveCSS('appearance', 'none')
  await expect(properties.getByRole('button', { name: '返回写作' })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('mobile-properties.png') })
  await page.keyboard.press('Escape')
  await expect(tools.getByRole('button', { name: '属性', exact: true })).toBeFocused()
  await tools.getByRole('button', { name: '文档', exact: true }).click()
  const document = page.getByRole('dialog', { name: '文档', exact: true })
  await expect(document.getByRole('button', { name: '预览文章' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mobile-document.png') })
  await document.getByRole('button', { name: '预览文章' }).click()
  await expect(page.getByTitle('IMX 文章预览')).toBeVisible()
  await page.getByRole('button', { name: '返回编辑' }).click()
  await expect(document.getByRole('button', { name: '预览文章' })).toBeFocused()
  await document.getByRole('button', { name: '导出文章', exact: true }).click()
  const exportDialog = page.getByRole('dialog', { name: '导出 Hugo 文章包' })
  await expect(exportDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(exportDialog).toHaveCount(0)
  await expect(document).toBeVisible()
  await document.getByLabel('添加正文图片').setInputFiles(pngFile('phone.png', 32, 32, [117, 76, 172, 255]))
  await document.getByRole('button', { name: '插入', exact: true }).click()
  await expect(document).toHaveCount(0)
  await expect(editor).toBeFocused()
  await expect(editor).toHaveText('前文![phone](images/phone.png)后文')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(editor).toHaveText('前文后文')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(editor).toContainText('images/phone.png')
  for (const width of [320, 390, 430, 720]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(tools).toBeVisible()
    const box = (await page.locator('.markdown-editor').boundingBox())!
    expect(box.width).toBeGreaterThan(width - 75)
    expect(box.height).toBeGreaterThan(600)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('mobile-source.png') })
  expect(errors).toEqual([])
})

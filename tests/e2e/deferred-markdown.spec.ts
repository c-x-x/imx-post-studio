import { expect, test } from '@playwright/test'
import { setEditorMode } from '../helpers/editor-mode'

test('applies a link to the selected text while other Markdown in the line is pending', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await page.getByRole('tab', { name: '排版' }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.click()
  await editor.pressSequentially('**粗体** 链接 尾部')
  await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const start = node.textContent?.indexOf('链接') ?? -1
      if (start < 0) continue
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + 2)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      return
    }
    throw new Error('Link text is missing')
  })
  await page.getByRole('button', { name: '链接', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '插入链接' })
  await expect(dialog.getByLabel('链接文字')).toHaveValue('链接')
  await dialog.getByLabel('链接地址').fill('https://example.com')
  await dialog.getByRole('button', { name: '插入链接' }).click()
  await expect(editor.locator('a')).toHaveText('链接')
  await page.getByLabel('标题', { exact: true }).click()
  await expect(editor.locator('strong')).toHaveText('粗体')
  await expect(editor).toContainText('尾部')
})

test('wraps selected text with toolbar Markdown without leaving a persistent inline mark', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await page.getByRole('tab', { name: '排版' }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill('选中文字')
  await editor.evaluate((element) => {
    const text = element.querySelector('p')?.firstChild
    if (!text) throw new Error('Selectable text is missing')
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })

  const boldButton = page.getByRole('button', { name: '加粗', exact: true })
  await boldButton.click()
  await expect(editor).toContainText('**选中文字**')
  await expect(editor.locator('strong')).toHaveCount(0)
  await expect(editor.locator('.editor-toolbar-markdown-marker')).toHaveCount(2)
  await expect(boldButton).toHaveAttribute('aria-pressed', 'false')

  await editor.locator('p').last().click()
  await editor.pressSequentially('普通输入')
  await expect(editor.locator('strong')).toHaveText('选中文字')
  await expect(editor.locator('strong')).not.toContainText('普通输入')
  await expect(boldButton).toHaveAttribute('aria-pressed', 'false')
})

test('defers typed Markdown until leaving the paragraph and keeps toolbar formatting immediate', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.click()
  for (const level of [1, 2, 3, 4, 5, 6]) {
    await editor.pressSequentially(`${'#'.repeat(level)} 标题${level}`)
    await expect(editor.locator(`h${level}`)).toHaveCount(0)
    await expect(editor.locator('.editor-markdown-marker')).toContainText('#'.repeat(level))
    await editor.press('Enter')
    await expect(editor.locator(`h${level}`)).toHaveText(`标题${level}`)
  }
  await editor.pressSequentially('**中文加粗** *中文斜体* ~~删除文字~~')
  await expect(editor.locator('strong, em, s')).toHaveCount(0)
  await editor.press('Enter')
  await expect(editor.locator('strong')).toHaveText('中文加粗')
  await expect(editor.locator('em')).toHaveText('中文斜体')
  await expect(editor.locator('s')).toHaveText('删除文字')
  await editor.pressSequentially('下一行普通文字')
  await expect(editor.locator('strong')).not.toContainText('下一行普通文字')
  await page.getByRole('tab', { name: '排版' }).click()
  await page.getByRole('button', { name: '加粗' }).click()
  await expect(editor).toContainText('****')
  await expect(editor.locator('.editor-toolbar-markdown-marker')).toHaveCount(2)
  await editor.pressSequentially('工具栏加粗')
  await expect(editor.locator('strong')).not.toContainText('工具栏加粗')
  await editor.press('Enter')
  await expect(editor.locator('strong').filter({ hasText: '工具栏加粗' })).toHaveText('工具栏加粗')
  await expect(page.getByRole('button', { name: '加粗' })).toHaveAttribute('aria-pressed', 'false')
  await editor.pressSequentially('工具栏后的普通文字')
  const plainAfterToolbar = editor.locator('p').filter({ hasText: '工具栏后的普通文字' })
  await expect(plainAfterToolbar).toHaveCount(1)
  await expect(plainAfterToolbar.locator('strong, em, s')).toHaveCount(0)
  await page.getByRole('button', { name: 'H2' }).click()
  await expect(editor.locator('h2')).toHaveCount(2)
  await expect(editor.locator('h2').last()).toHaveText('工具栏后的普通文字')
  await expect(page.getByRole('button', { name: 'H2' })).toHaveAttribute('aria-pressed', 'true')
  await setEditorMode(page, 'source')
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText('~~删除文字~~')
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).not.toContainText('\\*')
})

test('commits inline Markdown after inherited formatting and editor blur without writing hints', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.click()
  await editor.pressSequentially('**已有加粗**')
  await editor.press('Enter')
  const bold = editor.locator('strong')
  const bounds = await bold.boundingBox()
  if (!bounds) throw new Error('Bold text is not visible')
  await bold.click({ position: { x: bounds.width - 1, y: bounds.height / 2 } })
  await editor.pressSequentially(' *继续斜体* ~~删除~~')
  await expect(editor.locator('em, s')).toHaveCount(0)
  await page.getByLabel('标题', { exact: true }).click()
  await expect(editor.locator('em')).toHaveText('继续斜体')
  await expect(editor.locator('s')).toHaveText('删除')
  await expect(editor.locator('strong').first()).toContainText('已有加粗')
  await expect(page.locator('.editor-context-hint')).toHaveCount(0)
  await expect(page.locator('.editor-save-status')).toBeVisible()
})

test('reveals rendered inline source on click and only reparses complete syntax', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await setEditorMode(page, 'source')
  const sourceEditor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await sourceEditor.fill('**粗体** *斜体* ~~删除~~ `代码`\n\n$E=mc^2$\n\n点击处')
  await setEditorMode(page, 'rich')
  await page.getByRole('tab', { name: '排版' }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.focus()
  const otherParagraph = editor.locator('p').filter({ hasText: '点击处' })
  const formats = [
    ['strong', '**粗体**', '加粗'],
    ['em', '*斜体*', '斜体'],
    ['s', '~~删除~~', '删除线'],
    ['code', '`代码`', '行内代码'],
  ] as const

  for (const [selector, markdown, button] of formats) {
    await editor.locator(selector).first().click()
    await expect(editor.locator(selector).first()).toHaveCount(0)
    await expect(editor).toContainText(markdown)
    await expect(page.getByRole('button', { name: button, exact: true })).toHaveAttribute('aria-pressed', 'false')
    await otherParagraph.click()
    await expect(editor.locator(selector).first()).toBeVisible()
  }

  const formula = editor.locator('[data-math="inline"]')
  await formula.locator('.katex-html').click()
  await expect(formula).toHaveCount(0)
  await expect(editor).toContainText('$E=mc^2$')
  await editor.press('Delete')
  await expect(editor).toContainText('$E=mc^2')
  await otherParagraph.click()
  await expect(editor.locator('[data-math="inline"]')).toHaveCount(0)
  await expect(editor.locator('strong')).toHaveText('粗体')

  for (const [selector, markdown, button] of [['mark', '<mark>高亮</mark>', '高亮'], ['sub', '<sub>2</sub>', '下标'], ['sup', '<sup>2</sup>', '上标']] as const) {
    const trailingParagraph = editor.locator('p').last()
    await trailingParagraph.click()
    await page.getByRole('button', { name: button, exact: true }).click()
    await editor.pressSequentially(button === '高亮' ? '高亮' : '2')
    await expect(editor).toContainText(markdown)
    await expect(page.getByRole('button', { name: button, exact: true })).toHaveAttribute('aria-pressed', 'false')
    await otherParagraph.click()
    await expect(editor.locator(selector)).toBeVisible()
    await editor.locator(selector).click()
    await expect(editor.locator(selector)).toHaveCount(0)
    await expect(editor).toContainText(markdown)
    await expect(page.getByRole('button', { name: button, exact: true })).toHaveAttribute('aria-pressed', 'false')
    await otherParagraph.click()
    await expect(editor.locator(selector)).toBeVisible()
  }

  await editor.locator('strong').click()
  await expect(editor).toContainText('**粗体**')
  const openingBoldMarker = editor.locator('.editor-markdown-marker').filter({ hasText: '**' }).first()
  await openingBoldMarker.evaluate((element) => {
    const text = element.firstChild
    if (!text) throw new Error('Bold source marker is missing')
    const range = document.createRange()
    range.setStart(text, 1)
    range.collapse(true)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await editor.press('Backspace')
  await otherParagraph.click()
  await expect(editor.locator('strong')).toHaveCount(0)
  await expect(editor).toContainText('*粗体**')
})

test('keeps H1-H6 rendered with a visual-only divider while the caret is inside', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await setEditorMode(page, 'source')
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill(Array.from({ length: 6 }, (_, index) => `${'#'.repeat(index + 1)} 标题${index + 1}`).join('\n\n') + '\n\n普通')
  await setEditorMode(page, 'rich')
  await page.getByRole('tab', { name: '排版' }).click()

  for (let level = 1; level <= 6; level += 1) {
    const heading = editor.locator(`h${level}`)
    await heading.click()
    await expect(heading).toHaveText(`标题${level}`)
    await expect(heading).toHaveCSS('border-bottom-style', 'solid')
    await expect(heading).toHaveCSS('border-bottom-width', '1px')
    await expect(page.getByRole('button', { name: `H${level}` })).toHaveAttribute('aria-pressed', 'true')
  }
  await expect(editor.locator('hr')).toHaveCount(0)
  await setEditorMode(page, 'source')
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).not.toContainText('---')
})

test('inserts muted source placeholders from empty text-style controls', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await setEditorMode(page, 'source')
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('\\*\n\n')
  await setEditorMode(page, 'rich')
  await page.getByRole('tab', { name: '排版' }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  const formats = [
    { button: '加粗', open: '**', close: '**', selector: 'strong', text: '加粗' },
    { button: '斜体', open: '*', close: '*', selector: 'em', text: '斜体' },
    { button: '删除线', open: '~~', close: '~~', selector: 's', text: '删除' },
    { button: '行内代码', open: '`', close: '`', selector: 'code', text: '代码' },
    { button: '高亮', open: '<mark>', close: '</mark>', selector: 'mark', text: '高亮' },
    { button: '下标', open: '<sub>', close: '</sub>', selector: 'sub', text: '2' },
    { button: '上标', open: '<sup>', close: '</sup>', selector: 'sup', text: '2' },
  ] as const

  for (const [index, format] of formats.entries()) {
    await editor.locator('p').last().click()
    await page.getByRole('button', { name: format.button, exact: true }).click()
    const paragraph = editor.locator('p:has(.editor-toolbar-markdown-marker)').last()
    await expect(paragraph).toContainText(`${format.open}${format.close}`)
    const toolbarMarkers = paragraph.locator('.editor-toolbar-markdown-marker')
    await expect(toolbarMarkers).toHaveCount(2)
    if (index === 0) {
      const [markerColor, normalColor] = await Promise.all([
        toolbarMarkers.first().evaluate((element) => getComputedStyle(element).color),
        editor.locator('p').first().evaluate((element) => getComputedStyle(element).color),
      ])
      expect(markerColor).not.toBe(normalColor)
    }
    await editor.pressSequentially(format.text)
    await expect(paragraph).toContainText(`${format.open}${format.text}${format.close}`)
    await editor.press('Enter')
    await expect(editor.locator(format.selector).last()).toHaveText(format.text)
  }
})

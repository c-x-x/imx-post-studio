import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Download, type Page } from '@playwright/test'
import { pngFile, type TestFilePayload } from '../helpers/test-images'

const ARTICLE_TITLE = '浏览器中的 IMX 图片工作流'
const ARTICLE_SLUG = 'imx-browser-workflow'
const ARTICLE_DATE = '2026-08-04T09:45:00+08:00'
const ARTICLE_DESCRIPTION = '浏览器端 IMX 文章编辑与 Hugo 文章包测试。'
const ARTICLE_BODY = [
  '## 文章目录',
  '',
  '这一段用于验证 IMX 文章预览和图片引用。',
  '',
  '### 细节',
  '',
  '| 名称 | 值 |',
  '| --- | --- |',
  '| 格式 | WebP |',
  '',
  '> 这是一段引用文字。',
  '',
  '```js',
  'const answer = 42',
  '```',
  '',
  '- 第一个列表项',
].join('\n')

async function beginArticle(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '文章', exact: true }).click()
  await expect(page.getByRole('region', { name: '文章工作区' })).toBeVisible()
}

async function fillMetadata(page: Page): Promise<void> {
  await page.getByLabel('标题').fill(ARTICLE_TITLE)
  await page.getByLabel('Slug').fill(ARTICLE_SLUG)
  await page.getByLabel('发布日期').fill(ARTICLE_DATE)
  await page.getByLabel('摘要').fill(ARTICLE_DESCRIPTION)
  await page.getByLabel('分类', { exact: true }).fill('测试')
  await page.getByLabel('分类', { exact: true }).press('Enter')
  await page.getByLabel('标签', { exact: true }).fill('IMX')
  await page.getByLabel('标签', { exact: true }).press('Enter')
}

async function readZip(download: Download): Promise<{ archive: Buffer; entries: Map<string, Uint8Array> }> {
  const path = await download.path()
  if (!path) throw new Error('Playwright did not provide the downloaded ZIP path')
  const archive = await readFile(path)
  const reader = new ZipReader(new BlobReader(new Blob([archive])))
  try {
    const entries = await reader.getEntries()
    return { archive, entries: new Map(await Promise.all(entries.filter((entry) => !entry.directory).map(async (entry) => {
      const blob = await entry.getData(new BlobWriter())
      return [entry.filename, new Uint8Array(await blob.arrayBuffer())] as const
    }))) }
  } finally {
    await reader.close()
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function imageDimensions(page: Page, bytes: Uint8Array): Promise<{ width: number; height: number }> {
  return page.evaluate(async ({ imageBytes }) => {
    const blob = new Blob([new Uint8Array(imageBytes)])
    const bitmap = await createImageBitmap(blob)
    try {
      return { width: bitmap.width, height: bitmap.height }
    } finally {
      bitmap.close()
    }
  }, { imageBytes: Array.from(bytes) })
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
}

async function mediaNames(page: Page): Promise<string[]> {
  return page.getByLabel('已添加图片').getByRole('listitem').evaluateAll((items) => items
    .map((item) => item.getAttribute('aria-label') ?? '')
    .sort())
}

async function pasteImages(page: Page, files: TestFilePayload[]): Promise<void> {
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).evaluate((editor, payloads) => {
    const transfer = new DataTransfer()
    for (const payload of payloads) {
      transfer.items.add(new File([new Uint8Array(payload.bytes)], payload.name, { type: payload.mimeType }))
    }
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    editor.dispatchEvent(event)
  }, files.map((file) => ({ name: file.name, mimeType: file.mimeType, bytes: [...file.buffer] })))
}

async function markdownSource(page: Page): Promise<string> {
  await page.getByRole('button', { name: '源代码' }).click()
  const source = (await page.getByRole('textbox', { name: 'Markdown 编辑器' }).locator('.cm-line').allTextContents()).join('\n')
  await page.getByRole('button', { name: '即时排版' }).click()
  return source
}

async function assertEditorState(page: Page, expected: {
  draft: boolean
  body: string
}): Promise<void> {
  await expect(page.getByLabel('标题')).toHaveValue(ARTICLE_TITLE)
  await expect(page.getByLabel('Slug')).toHaveValue(ARTICLE_SLUG)
  await expect(page.getByLabel('发布日期')).toHaveValue(ARTICLE_DATE)
  await expect(page.getByLabel('摘要')).toHaveValue(ARTICLE_DESCRIPTION)
  expect(await page.locator('[aria-label="分类列表"] .chip').evaluateAll((items) => items.map((item) => item.firstChild?.textContent))).toEqual(['测试'])
  expect(await page.locator('[aria-label="标签列表"] .chip').evaluateAll((items) => items.map((item) => item.firstChild?.textContent))).toEqual(['IMX'])
  await expect(page.getByLabel('草稿')).toBeChecked({ checked: expected.draft })
  await expect(page.getByLabel('显示目录')).toBeChecked()
  expect(await markdownSource(page)).toBe(expected.body)
  await expect(page.getByLabel('当前封面')).toContainText('封面')
  expect(await mediaNames(page)).toEqual(['workflow.png'])
}

async function scanPreviewDomWithAxe(page: Page) {
  const preview = page.getByTitle('IMX 文章预览')
  await expect(preview.locator('script')).toHaveCount(0)
  await expect(preview.locator('.preview-body')).toBeVisible()
  return new AxeBuilder({ page }).analyze()
}

test('authors, saves, reloads, exports, and reimports an IMX Hugo article bundle', async ({ page }) => {
  await beginArticle(page)
  await fillMetadata(page)

  await page.getByLabel('选择封面').setInputFiles(pngFile('cover-source.png', 900, 1600, [31, 112, 180, 255]))
  await expect(page.getByRole('dialog', { name: '裁剪封面' })).toBeVisible()
  await page.getByRole('button', { name: '使用此封面' }).click()
  await expect(page.getByRole('dialog', { name: '裁剪封面' })).toHaveCount(0)
  await expect(page.getByLabel('当前封面')).toContainText('封面')

  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill(ARTICLE_BODY)
  await pasteImages(page, [pngFile('workflow.png', 320, 180, [232, 121, 36, 255])])
  const imageItem = page.getByRole('listitem', { name: 'workflow.png' })
  await expect(imageItem).toBeVisible()
  const expectedBody = await markdownSource(page)
  expect(expectedBody).toContain('![workflow](images/workflow.png)')

  await expect(page.getByTitle('IMX 文章预览')).toHaveCount(0)
  await page.getByRole('button', { name: '预览文章' }).click()
  await expect(page.getByRole('dialog', { name: 'IMX 文章预览' })).toBeVisible()
  const preview = page.getByTitle('IMX 文章预览')
  await expect(preview.locator('h1.article-title')).toHaveText(ARTICLE_TITLE)
  await expect(preview.getByRole('heading', { name: '文章目录', level: 2 })).toBeVisible()
  await expect(preview.locator('.toc')).toContainText('文章目录')
  await expect(preview.locator('table')).toContainText('WebP')
  await expect(preview.locator('blockquote')).toContainText('这是一段引用文字。')
  await expect(preview.locator('pre code')).toContainText('const answer = 42')
  await expect(preview.locator('img[src^="blob:"]')).toHaveCount(1)
  await page.getByRole('button', { name: '返回编辑' }).click()
  await expect(page.getByTitle('IMX 文章预览')).toHaveCount(0)

  await expect(page.getByRole('status')).toContainText('已保存到本地草稿')
  await page.reload()
  await page.getByRole('button', { name: '草稿库' }).click()
  await expect(page.getByRole('region', { name: '草稿库' })).toBeVisible()
  await expect(page.getByRole('heading', { name: ARTICLE_TITLE })).toBeVisible()
  await page.getByRole('button', { name: '打开' }).click()
  await assertEditorState(page, { draft: true, body: expectedBody })

  const reloadDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出草稿' }).click()
  const reloadZip = await readZip(await reloadDownload)

  const productionDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出文章' }).click()
  await page.getByRole('button', { name: '设为 draft = false' }).click()
  const productionZip = await readZip(await productionDownload)
  const index = new TextDecoder().decode(productionZip.entries.get(`${ARTICLE_SLUG}/index.md`))
  const cover = productionZip.entries.get(`${ARTICLE_SLUG}/images/cover.webp`)
  const bodyImage = productionZip.entries.get(`${ARTICLE_SLUG}/images/workflow.png`)
  expect(index).toContain('draft = false')
  expect(index).toContain('![workflow](images/workflow.png)')
  expect(cover).toBeDefined()
  expect(bodyImage).toBeDefined()
  expect(isWebp(cover!)).toBe(true)
  const dimensions = await imageDimensions(page, cover!)
  expect(dimensions.width).toBeLessThanOrEqual(1600)
  expect(dimensions.height).toBeLessThanOrEqual(900)
  expect(dimensions.width / dimensions.height).toBe(16 / 9)
  expect(sha256(reloadZip.entries.get(`${ARTICLE_SLUG}/images/cover.webp`)!)).toBe(sha256(cover!))
  expect(sha256(reloadZip.entries.get(`${ARTICLE_SLUG}/images/workflow.png`)!)).toBe(sha256(bodyImage!))

  await page.getByRole('button', { name: '新建文章' }).click()
  await expect(page.getByRole('dialog', { name: '新建文章前是否保存？' })).toBeVisible()
  await page.getByRole('button', { name: '删除草稿并继续' }).click()
  await expect(page.getByLabel('标题')).toHaveValue('')
  await page.getByLabel('导入 ZIP').setInputFiles({
    name: `${ARTICLE_SLUG}.zip`,
    mimeType: 'application/zip',
    buffer: productionZip.archive,
  })
  await expect(page.getByRole('dialog', { name: '导入已验证' })).toBeVisible()
  const importAsNew = page.getByRole('button', { name: '作为新草稿打开' })
  await importAsNew.hover()
  await expect(importAsNew).toHaveCSS('transform', 'none')
  await importAsNew.click()
  await assertEditorState(page, { draft: false, body: expectedBody })

  const roundTripDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出草稿' }).click()
  const roundTripZip = await readZip(await roundTripDownload)
  expect([...roundTripZip.entries.keys()].sort()).toEqual([
    `${ARTICLE_SLUG}/images/cover.webp`,
    `${ARTICLE_SLUG}/images/workflow.png`,
    `${ARTICLE_SLUG}/index.md`,
  ])
  expect(sha256(roundTripZip.entries.get(`${ARTICLE_SLUG}/images/cover.webp`)!)).toBe(sha256(cover!))
  expect(sha256(roundTripZip.entries.get(`${ARTICLE_SLUG}/images/workflow.png`)!)).toBe(sha256(bodyImage!))
})

test('has no serious or critical axe violations on the home, dashboard, and workspace views', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home-principles span').first()).toHaveCSS('color', 'rgb(95, 88, 80)')
  await expect(page.locator('.home-workflow p').first()).toHaveCSS('color', 'rgb(95, 88, 80)')
  const homeResults = await new AxeBuilder({ page }).analyze()
  expect(homeResults.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])

  await page.getByRole('button', { name: '草稿库' }).click()
  const dashboardResults = await new AxeBuilder({ page }).analyze()
  expect(dashboardResults.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])

  await page.getByRole('button', { name: '文章', exact: true }).focus()
  await expect(page.getByRole('button', { name: '文章', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await fillMetadata(page)
  await expect(page.locator('.cover-help')).toHaveCSS('color', 'rgb(95, 88, 80)')
  await page.getByRole('button', { name: '预览文章' }).click()
  const workspaceResults = await scanPreviewDomWithAxe(page)
  expect(workspaceResults.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])
})

test('keeps keyboard focus in the export dialog', async ({ page }) => {
  await beginArticle(page)
  await fillMetadata(page)
  const exportButton = page.getByRole('button', { name: '导出文章' })
  await exportButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: '导出 Hugo 文章包' })).toBeVisible()
  await expect(page.getByRole('button', { name: '取消' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(exportButton).toBeFocused()
})

test('keeps both responsive workspace tabs mounted and opens preview without horizontal overflow', async ({ page }) => {
  await beginArticle(page)
  await fillMetadata(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const workspaceTabs = page.getByRole('tablist', { name: '工作区视图' })
  await expect(workspaceTabs).toBeVisible()
  await expect(workspaceTabs.getByRole('tab')).toHaveCount(2)
  await expect(page.locator('#panel-settings, #panel-write')).toHaveCount(2)
  const expectNoHorizontalOverflow = () => expect(page.locator('html').evaluate((element) => element.scrollWidth <= window.innerWidth)).resolves.toBe(true)
  await expectNoHorizontalOverflow()
  await page.getByRole('tab', { name: '写作' }).click()
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toBeVisible()
  await expectNoHorizontalOverflow()
  await page.getByRole('button', { name: '预览文章' }).click()
  await expect(page.getByTitle('IMX 文章预览')).toBeVisible()
  await expectNoHorizontalOverflow()
  await page.getByRole('button', { name: '返回编辑' }).click()
  await page.getByRole('tab', { name: '设置', exact: true }).click()
  await expect(page.getByLabel('标题')).toHaveValue(ARTICLE_TITLE)
  await expectNoHorizontalOverflow()
})

test('renders usable code blocks and keeps the preview back control stationary', async ({ page, browserName }) => {
  if (browserName === 'webkit') {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => undefined },
      })
    })
  }
  await beginArticle(page)
  await fillMetadata(page)
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('```bash\n# 当前目录\nclear\n```')
  await page.getByRole('button', { name: '预览文章' }).click()

  const preview = page.getByTitle('IMX 文章预览')
  const codeBlock = preview.locator('.highlight')
  await expect(codeBlock).toHaveAttribute('data-code-lang', 'bash')
  await expect(codeBlock.locator('.code-window-controls span')).toHaveCount(3)
  await expect(codeBlock.locator('.code-language')).toHaveText('Bash')
  const codeColor = await codeBlock.locator('code').evaluate((element) => getComputedStyle(element).color)
  const commentColor = await codeBlock.locator('.hljs-comment').evaluate((element) => getComputedStyle(element).color)
  expect(commentColor).not.toBe(codeColor)
  const copy = codeBlock.getByRole('button', { name: '复制代码' })
  await copy.click()
  await expect(copy).toHaveText('已复制')

  const back = page.getByRole('button', { name: '返回编辑' })
  const beforeHover = await back.boundingBox()
  await back.hover()
  await expect.poll(async () => await back.boundingBox()).toEqual(beforeHover)
})

test('creates and edits a Markdown table across source, preview, and mobile layouts', async ({ page }) => {
  await beginArticle(page)
  await fillMetadata(page)

  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill('表格前的正文\n\n')
  await editor.press('ControlOrMeta+End')
  await page.getByRole('button', { name: '表格' }).click()
  const dialog = page.getByRole('dialog', { name: '插入表格' })
  await expect(dialog.getByLabel('列数')).toHaveValue('3')
  await expect(dialog.getByLabel('数据行数')).toHaveValue('2')
  await dialog.getByLabel('列数').fill('2')
  await dialog.getByLabel('数据行数').fill('1')
  await dialog.getByRole('button', { name: '插入' }).click()

  const firstHeader = page.getByRole('textbox', { name: '第 1 行第 1 列' })
  await expect(firstHeader).toBeFocused()
  await expect(page.locator('.cm-md-table-separator')).toHaveCSS('height', '0px')
  await expect(page.getByRole('button', { name: '删除整个表格' })).toBeVisible()
  expect(await firstHeader.evaluate((input) => ({
    start: (input as HTMLInputElement).selectionStart,
    end: (input as HTMLInputElement).selectionEnd,
  }))).toEqual({ start: 0, end: 3 })

  const firstLineAfterTable = page.locator('.cm-md-table').locator('xpath=following-sibling::*[contains(concat(" ", normalize-space(@class), " "), " cm-line ")][1]')
  await firstLineAfterTable.click({ position: { x: 8, y: 1 } })
  await page.keyboard.type('直接写作')
  await expect(page.getByRole('textbox', { name: '第 1 行第 1 列' })).toBeVisible()

  await firstHeader.fill('A|B')
  await page.getByRole('textbox', { name: '第 1 行第 2 列' }).fill('值')
  await page.getByRole('textbox', { name: '第 2 行第 1 列' }).fill('格式')
  await page.getByRole('textbox', { name: '第 2 行第 2 列' }).fill('WebP')

  await firstHeader.focus()
  await firstHeader.press('Tab')
  await expect(page.getByRole('textbox', { name: '第 1 行第 2 列' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(firstHeader).toBeFocused()

  await page.getByRole('textbox', { name: '第 2 行第 1 列' }).focus()
  await page.getByRole('button', { name: '在当前行下方添加一行' }).click()
  await expect(page.getByRole('textbox', { name: '第 3 行第 1 列' })).toBeFocused()
  await page.getByRole('button', { name: '在当前列右侧添加一列' }).click()
  await expect(page.getByRole('textbox', { name: '第 3 行第 2 列' })).toBeFocused()

  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByRole('textbox', { name: '第 3 行第 3 列' })).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.getByRole('textbox', { name: '第 3 行第 3 列' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('已保存到本地草稿')

  await page.getByRole('button', { name: '在表格下方继续写作' }).click()
  await page.keyboard.type('表格后的正文')
  await expect(page.getByRole('textbox', { name: '第 1 行第 1 列' })).toBeVisible()

  await page.getByRole('button', { name: '删除整个表格' }).click()
  await expect(page.getByRole('textbox', { name: '第 1 行第 1 列' })).toHaveCount(0)
  expect(await markdownSource(page)).toContain('表格后的正文')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByRole('textbox', { name: '第 1 行第 1 列' })).toBeVisible()

  const source = await markdownSource(page)
  expect(source).toContain('| A\\|B | 列 2 | 值 |')
  expect(source).toContain('| 格式 | 内容 | WebP |')
  expect(source).toContain('| 内容 | 内容 | 内容 |')
  expect(source).toContain('\n\n表格后的正文直接写作')

  await page.getByRole('button', { name: '预览文章' }).click()
  const preview = page.getByTitle('IMX 文章预览')
  await expect(preview.locator('table')).toContainText('A|B')
  await expect(preview.locator('table')).toContainText('WebP')
  await page.getByRole('button', { name: '返回编辑' }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: '写作' }).click()
  await expect(page.getByRole('textbox', { name: '第 1 行第 1 列' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.locator('.cm-md-table-scroll').evaluate((element) => element.scrollWidth >= element.clientWidth)).toBe(true)
})

test('clicking editor whitespace creates a writable line after the document', async ({ page }) => {
  await beginArticle(page)
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill('第一行')

  const content = await page.locator('.markdown-editor .cm-content').boundingBox()
  const lastLine = await page.locator('.markdown-editor .cm-line').last().boundingBox()
  if (!content || !lastLine) throw new Error('Editor geometry is unavailable')
  await page.mouse.click(content.x + 40, lastLine.y + lastLine.height + 36)
  await page.keyboard.type('第二行')

  expect(await markdownSource(page)).toBe('第一行\n第二行')
})

test('live writing formats Markdown, preserves source, and visually wraps at narrow widths', async ({ page }) => {
  await beginArticle(page)
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  const longLine = `长段落${'只做视觉换行而不写入换行符'.repeat(28)}`
  const markdownSource = [
    '# 一级标签',
    '',
    '## 二级标签',
    '',
    '### 三级标签',
    '',
    '#### 四级标签',
    '',
    '##### 五级标签',
    '',
    '###### 六级标签',
    '',
    '普通 **粗体**、*斜体*、~~删除线~~、`代码` 和 [链接](https://example.com)。',
    '',
    '> 引用',
    '',
    '- 列表',
    '',
    '- [ ] 未完成',
    '- [x] 已完成',
    '',
    '```ts',
    'const answer = 42',
    '```',
    '',
    '---',
    '',
    longLine,
  ].join('\n')
  await page.getByRole('button', { name: '源代码' }).click()
  await editor.fill(markdownSource)
  await page.getByRole('button', { name: '即时排版' }).click()

  for (const className of ['heading-1', 'strong', 'emphasis', 'strikethrough', 'inline-code', 'link', 'quote', 'list', 'horizontal-rule']) {
    await expect(page.locator(`.cm-md-${className}`).first()).toBeVisible()
  }
  await expect(page.locator('.cm-md-fenced-code').filter({ hasText: 'const answer = 42' })).toBeVisible()
  await expect(page.locator('.cm-md-code-line')).toHaveCount(1)
  await expect(page.locator('.cm-md-code-line')).toHaveAttribute('data-code-line', '1')
  await expect(page.getByRole('textbox', { name: '代码块语言' })).toHaveValue('ts')
  expect(await page.locator('.cm-md-hidden').count()).toBeGreaterThan(0)
  expect([...new Set(await page.locator('.cm-md-heading span').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).textDecorationLine)))])
    .toEqual(['none'])
  const leftEdges = await page.locator('.markdown-editor .cm-content').evaluate((content) => {
    const lines = [...content.querySelectorAll<HTMLElement>('.cm-line')]
      .filter((line) => line.classList.contains('cm-md-heading') || line.textContent?.includes('普通 '))
    return lines.map((line) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const text = node.textContent ?? ''
          return node.parentElement?.closest('.cm-md-hidden') || !/\S/.test(text)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT
        },
      })
      const text = walker.nextNode()
      const offset = text?.textContent?.search(/\S/) ?? -1
      if (!text || offset < 0) throw new Error('Missing visible editor text')
      const range = document.createRange()
      range.setStart(text, offset)
      range.setEnd(text, offset + 1)
      return range.getBoundingClientRect().left
    })
  })
  expect(leftEdges).toHaveLength(7)
  expect(Math.max(...leftEdges) - Math.min(...leftEdges)).toBeLessThanOrEqual(1)
  const tasks = page.locator('.cm-md-task-checkbox')
  await expect(tasks).toHaveCount(2)
  await expect(tasks.nth(0)).not.toBeChecked()
  await expect(tasks.nth(1)).toBeChecked()
  await tasks.nth(0).click()

  await page.getByRole('button', { name: '源代码' }).click()
  await expect(editor).toContainText('- [x] 未完成')
  await page.getByRole('button', { name: '即时排版' }).click()
  await tasks.nth(0).click()
  await expect(page.getByRole('status')).toContainText('已保存到本地草稿')

  await page.getByRole('button', { name: '源代码' }).click()
  const beforeResize = (await editor.locator('.cm-line').allTextContents()).join('\n')
  expect(beforeResize).toBe(markdownSource)
  await page.getByRole('button', { name: '即时排版' }).click()
  await page.getByRole('tab', { name: '大纲' }).click()
  await page.getByRole('button', { name: '三级标签' }).click()
  await expect(editor.locator('.cm-activeLine')).toContainText('三级标签')
  const longParagraph = page.locator('.cm-line').filter({ hasText: longLine.slice(0, 20) })
  const wideHeight = await longParagraph.evaluate((line) => line.getBoundingClientRect().height)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '大纲' }).click()
  await page.getByRole('button', { name: '三级标签' }).click()
  await expect(page.getByRole('tab', { name: '写作' })).toHaveAttribute('aria-selected', 'true')
  await expect(editor.locator('.cm-activeLine')).toContainText('三级标签')
  await page.getByRole('tab', { name: '写作' }).click()
  const narrowHeight = await longParagraph.evaluate((line) => line.getBoundingClientRect().height)
  expect(narrowHeight).toBeGreaterThan(wideHeight)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.getByRole('button', { name: '源代码' }).click()
  expect((await editor.locator('.cm-line').allTextContents()).join('\n')).toBe(beforeResize)
})

test('clicking a distant outline heading scrolls it into the editor viewport', async ({ page }) => {
  await beginArticle(page)
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  const markdown = [
    '## 开头标题',
    '',
    ...Array.from({ length: 90 }, (_, index) => `第 ${index + 1} 段正文，用于拉开标题之间的距离。`),
    '',
    '## 末尾标题',
  ].join('\n\n')

  await page.getByRole('button', { name: '源代码' }).click()
  await editor.fill(markdown)
  await page.getByRole('button', { name: '即时排版' }).click()
  const scroller = page.locator('.markdown-editor .cm-scroller')
  await scroller.evaluate((element) => { element.scrollTop = 0 })

  await page.getByRole('tab', { name: '大纲' }).click()
  await page.getByRole('button', { name: '末尾标题' }).click()

  await expect(editor.locator('.cm-activeLine')).toContainText('末尾标题')
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  const visibility = await editor.locator('.cm-activeLine').evaluate((line) => {
    const lineBounds = line.getBoundingClientRect()
    const scrollerBounds = line.closest('.cm-scroller')!.getBoundingClientRect()
    return lineBounds.top >= scrollerBounds.top && lineBounds.bottom <= scrollerBounds.bottom
  })
  expect(visibility).toBe(true)
})

test('clipboard image paste keeps duplicate filenames ordered and renders the local image', async ({ page }) => {
  await beginArticle(page)
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await page.getByRole('button', { name: '源代码' }).click()
  await editor.fill('正文')
  await page.getByRole('button', { name: '即时排版' }).click()
  await pasteImages(page, [
    pngFile('image.png', 80, 45, [12, 34, 56, 255]),
    pngFile('image.png', 90, 50, [78, 90, 12, 255]),
  ])

  const items = page.getByLabel('已添加图片').getByRole('listitem')
  await expect(items).toHaveCount(2)
  expect(await items.evaluateAll((entries) => entries.map((entry) => entry.getAttribute('aria-label')))).toEqual(['image.png', 'image-2.png'])

  await editor.press('ControlOrMeta+Home')
  await expect(page.locator('.cm-md-image img[src^="blob:"]')).toHaveCount(2)
  await page.getByRole('button', { name: '源代码' }).click()
  await expect(editor).toContainText('![image](images/image.png)')
  await expect(editor).toContainText('![image 2](images/image-2.png)')
})

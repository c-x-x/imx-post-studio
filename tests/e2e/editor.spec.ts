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
  await page.getByRole('button', { name: '写作', exact: true }).click()
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

async function pasteImages(page: Page, files: TestFilePayload[]): Promise<{ defaultPrevented: boolean; itemCount: number; itemTypes: string[] }> {
  return page.getByRole('textbox', { name: 'Markdown 编辑器' }).evaluate((editor, payloads) => {
    const transfer = new DataTransfer()
    for (const payload of payloads) {
      transfer.items.add(new File([new Uint8Array(payload.bytes)], payload.name, { type: payload.mimeType }))
    }
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { configurable: true, value: transfer })
    editor.dispatchEvent(event)
    return { defaultPrevented: event.defaultPrevented, itemCount: transfer.items.length, itemTypes: Array.from(transfer.items, (item) => `${item.kind}:${item.type}`) }
  }, files.map((file) => ({ name: file.name, mimeType: file.mimeType, bytes: [...file.buffer] })))
}

async function markdownSource(page: Page): Promise<string> {
  await page.getByRole('tab', { name: '排版' }).click()
  await page.getByRole('button', { name: '源代码' }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await expect(editor.locator('.cm-line').first()).toBeVisible()
  await expect(editor.locator('.cm-line').first()).not.toHaveText('')
  const source = (await editor.locator('.cm-line').allTextContents()).join('\n')
  await page.getByRole('button', { name: '即时排版' }).click()
  await page.getByRole('tab', { name: '文档' }).click()
  return source
}

async function setMarkdown(page: Page, value: string): Promise<void> {
  await page.getByRole('tab', { name: '排版' }).click()
  await page.getByRole('button', { name: '源代码' }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await expect(editor.locator('.cm-line').first()).toBeVisible()
  await editor.fill(value)
  await page.getByRole('button', { name: '即时排版' }).click()
  await page.getByRole('tab', { name: '文档' }).click()
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
  await expect(page.getByRole('checkbox', { name: '草稿', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('显示目录')).toBeChecked()
  const normalizeMarkdown = (source: string) => source
    .split('\n')
    .map((line) => {
      const compact = line.trim().replace(/\s*\|\s*/g, '|')
      return /^\|[:|-]+\|$/.test(compact) ? compact.replace(/-+/g, '---') : compact
    })
    .filter(Boolean)
    .join('\n')
  expect(normalizeMarkdown(await markdownSource(page))).toBe(normalizeMarkdown(expected.body))
  await expect(page.getByLabel('当前封面')).toContainText('封面')
  await page.getByRole('tab', { name: '排版' }).click()
  expect(await mediaNames(page)).toEqual(['workflow.png'])
  await page.getByRole('tab', { name: '文档' }).click()
}

async function scanPreviewDomWithAxe(page: Page) {
  const preview = page.getByTitle('IMX 文章预览')
  await expect(preview.locator('script')).toHaveCount(0)
  await expect(preview.locator('.preview-body')).toBeVisible()
  return new AxeBuilder({ page }).analyze()
}

test('authors, saves, reloads, exports, and reimports an IMX Hugo article bundle', { tag: ['@critical', '@webkit-smoke'] }, async ({ page, browserName }) => {
  // This full round trip includes image encoding, reload and three ZIP exports;
  // Linux WebKit needs more than the default 30s total, not longer assertion waits.
  if (browserName === 'webkit') test.setTimeout(60_000)
  await beginArticle(page)
  await fillMetadata(page)

  await page.getByLabel('选择封面').setInputFiles(pngFile('cover-source.png', 900, 1600, [31, 112, 180, 255]))
  await expect(page.getByRole('dialog', { name: '裁剪封面' })).toBeVisible()
  await page.getByRole('button', { name: '使用此封面' }).click()
  await expect(page.getByRole('dialog', { name: '裁剪封面' })).toHaveCount(0)
  await expect(page.getByLabel('当前封面')).toContainText('封面')

  await setMarkdown(page, ARTICLE_BODY)
  await page.getByRole('tab', { name: '排版' }).click()
  await page.getByLabel('添加正文图片').setInputFiles(pngFile('workflow.png', 320, 180, [232, 121, 36, 255]))
  const imageItem = page.getByRole('listitem', { name: 'workflow.png' })
  await expect(imageItem).toBeVisible()
  const expectedBody = `${ARTICLE_BODY}\n\n![workflow](images/workflow.png)`
  await setMarkdown(page, expectedBody)

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
  await page.getByRole('button', { name: '草稿', exact: true }).click()
  await expect(page.getByRole('region', { name: '草稿', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: ARTICLE_TITLE })).toBeVisible()
  await page.getByRole('button', { name: '打开' }).click()
  await assertEditorState(page, { draft: true, body: expectedBody })

  const reloadDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '备份草稿' }).click()
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
  await page.getByLabel('导入文章包').setInputFiles({
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
  await page.getByRole('button', { name: '备份草稿' }).click()
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

  await page.getByRole('button', { name: '草稿', exact: true }).click()
  const dashboardResults = await new AxeBuilder({ page }).analyze()
  expect(dashboardResults.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])

  await page.getByRole('button', { name: '写作', exact: true }).focus()
  await expect(page.getByRole('button', { name: '写作', exact: true })).toBeFocused()
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

test('keeps responsive workspace panels mounted and opens preview without horizontal overflow', async ({ page }) => {
  await beginArticle(page)
  await fillMetadata(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const workspaceTabs = page.getByRole('tablist', { name: '工作区视图' })
  await expect(workspaceTabs).toBeVisible()
  await expect(workspaceTabs.getByRole('tab')).toHaveCount(3)
  await expect(page.locator('#panel-settings, #panel-write, #panel-actions')).toHaveCount(3)
  const expectNoHorizontalOverflow = () => expect(page.locator('html').evaluate((element) => element.scrollWidth <= window.innerWidth)).resolves.toBe(true)
  await expectNoHorizontalOverflow()
  await page.getByRole('tab', { name: '写作' }).click()
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toBeVisible()
  await expectNoHorizontalOverflow()
  await page.getByRole('tab', { name: '工具', exact: true }).click()
  await page.getByRole('button', { name: '预览文章' }).click()
  await expect(page.getByTitle('IMX 文章预览')).toBeVisible()
  await expectNoHorizontalOverflow()
  await page.getByRole('button', { name: '返回编辑' }).click()
  await page.getByRole('tab', { name: '设置', exact: true }).click()
  await expect(page.getByLabel('标题')).toHaveValue(ARTICLE_TITLE)
  await expectNoHorizontalOverflow()
})

test('renders usable code blocks and keeps the preview back control stationary', { tag: '@critical' }, async ({ page, browserName }) => {
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
  await setMarkdown(page, '```bash\n# 当前目录\nclear\n```')
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

test('keeps current rich table controls safe and jumps to the selected outline heading', { tag: ['@critical', '@firefox-smoke', '@webkit-smoke'] }, async ({ page }) => {
  await beginArticle(page)
  const markdown = [
    '## 开头标题',
    '| A | B |\n| --- | --- |\n| 1 | 2 |',
    ...Array.from({ length: 45 }, (_, index) => `第 ${index + 1} 段正文。`),
    '## 末尾标题',
  ].join('\n\n')
  await setMarkdown(page, markdown)

  await page.getByRole('columnheader', { name: 'A' }).click()
  const tableToolbar = page.getByRole('toolbar', { name: '表格操作' })
  await expect(tableToolbar.getByRole('button', { name: '删除行' })).toBeDisabled()
  await expect(tableToolbar.getByRole('button', { name: '删除列' })).toBeDisabled()

  await page.getByRole('cell', { name: '2' }).click()
  await tableToolbar.getByRole('button', { name: '居中' }).click()
  expect(await markdownSource(page)).toContain('| --- | :---: |')

  const editorScroll = page.locator('.editor-scroll-region')
  await editorScroll.evaluate((element) => { element.scrollTop = 0 })
  await page.getByRole('tab', { name: '大纲' }).click()
  await page.getByRole('button', { name: '末尾标题' }).click()
  await expect.poll(() => editorScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection()
    return selection?.anchorNode?.parentElement?.closest('h1,h2,h3,h4,h5,h6')?.textContent ?? ''
  })).toBe('末尾标题')
})

test('pastes images at the active cursor in both rich and source modes', { tag: ['@critical', '@firefox-smoke', '@webkit-smoke'] }, async ({ page }) => {
  await beginArticle(page)
  await setMarkdown(page, '前面后面')
  const richEditor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await richEditor.evaluate((element) => {
    const text = element.querySelector('p')?.firstChild
    if (!text) throw new Error('Missing rich paragraph text')
    const range = document.createRange()
    range.setStart(text, 2)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    ;(element as HTMLElement).focus()
    document.dispatchEvent(new Event('selectionchange'))
  })
  expect(await pasteImages(page, [pngFile('rich.png', 40, 30, [12, 34, 56, 255])])).toMatchObject({ defaultPrevented: true, itemCount: 1, itemTypes: ['file:image/png'] })
  await page.getByRole('tab', { name: '排版' }).click()
  await expect(page.getByRole('listitem', { name: 'rich.png' })).toBeVisible()
  const richSource = await markdownSource(page)
  expect(richSource.indexOf('前面')).toBeLessThan(richSource.indexOf('![rich](images/rich.png)'))
  expect(richSource.indexOf('![rich](images/rich.png)')).toBeLessThan(richSource.indexOf('后面'))

  await page.getByRole('tab', { name: '排版' }).click()
  await page.getByRole('button', { name: '源代码' }).click()
  await page.getByRole('tab', { name: '文档' }).click()
  const sourceEditor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await sourceEditor.fill('源码前源码后')
  await sourceEditor.press('ControlOrMeta+Home')
  await sourceEditor.press('ArrowRight')
  await sourceEditor.press('ArrowRight')
  await sourceEditor.press('ArrowRight')
  expect(await pasteImages(page, [pngFile('source.png', 40, 30, [78, 90, 12, 255])])).toMatchObject({ defaultPrevented: true, itemCount: 1, itemTypes: ['file:image/png'] })
  await page.getByRole('tab', { name: '排版' }).click()
  await expect(page.getByRole('listitem', { name: 'source.png' })).toBeVisible()
  const sourceText = (await sourceEditor.locator('.cm-line').allTextContents()).join('\n')
  expect(sourceText.indexOf('源码前')).toBeLessThan(sourceText.indexOf('![source](images/source.png)'))
  expect(sourceText.indexOf('![source](images/source.png)')).toBeLessThan(sourceText.indexOf('源码后'))
})

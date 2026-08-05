import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Download, type Page } from '@playwright/test'
import { pngFile } from '../helpers/test-images'

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
  expect(await page.getByRole('textbox', { name: 'Markdown 编辑器' }).evaluate((editor) => editor.textContent)).toBe(expected.body)
  expect(await mediaNames(page)).toEqual(['cover.webp', 'workflow.png'])
}

async function scanPreviewDomWithAxe(page: Page) {
  const iframe = page.getByTitle('IMX 文章预览')
  const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
  const srcDoc = await iframe.getAttribute('srcdoc')
  if (!srcDoc) throw new Error('预览 iframe 缺少 srcDoc')

  // This is static preview-DOM evidence only. Production keeps the exact
  // script-free sandbox; the harness briefly reloads the identical srcDoc with
  // scripts permitted so Axe can inspect it, then restores the original DOM.
  await expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin')
  await expect(iframe).not.toHaveAttribute('sandbox', /allow-scripts/)
  await expect(preview.locator('script')).toHaveCount(0)
  await iframe.evaluate((element, documentHtml) => {
    element.setAttribute('sandbox', 'allow-same-origin allow-scripts')
    ;(element as HTMLIFrameElement).srcdoc = documentHtml
  }, srcDoc)

  try {
    await expect(preview.locator('body')).toBeVisible()
    return await new AxeBuilder({ page }).analyze()
  } finally {
    await iframe.evaluate((element, documentHtml) => {
      element.setAttribute('sandbox', 'allow-same-origin')
      ;(element as HTMLIFrameElement).srcdoc = documentHtml
    }, srcDoc)
    await expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin')
    await expect(preview.locator('script')).toHaveCount(0)
  }
}

test('authors, saves, reloads, exports, and reimports an IMX Hugo article bundle', async ({ page }) => {
  await beginArticle(page)
  await fillMetadata(page)

  await page.getByLabel('选择封面').setInputFiles(pngFile('cover-source.png', 2000, 1200, [31, 112, 180, 255]))
  await expect(page.getByRole('dialog', { name: '裁剪封面' })).toBeVisible()
  await page.getByRole('button', { name: '使用此封面' }).click()
  await expect(page.getByRole('dialog', { name: '裁剪封面' })).toHaveCount(0)
  await expect(page.getByLabel('已添加图片')).toContainText('封面')

  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill(ARTICLE_BODY)
  await page.getByLabel('添加正文图片').setInputFiles(pngFile('workflow.png', 320, 180, [232, 121, 36, 255]))
  const imageItem = page.getByRole('listitem', { name: 'workflow.png' })
  await expect(imageItem).toBeVisible()
  await imageItem.getByRole('button', { name: '插入' }).click()
  const expectedBody = await editor.evaluate((element) => element.textContent ?? '')
  expect(expectedBody).toContain('![workflow](images/workflow.png)')

  await expect(page.getByTitle('IMX 文章预览')).toHaveCount(0)
  await page.getByRole('button', { name: '预览文章' }).click()
  await expect(page.getByRole('dialog', { name: 'IMX 文章预览' })).toBeVisible()
  const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
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
  await expect(page.getByLabel('标题')).toHaveValue('')
  await page.getByLabel('导入 ZIP').setInputFiles({
    name: `${ARTICLE_SLUG}.zip`,
    mimeType: 'application/zip',
    buffer: productionZip.archive,
  })
  await expect(page.getByRole('dialog', { name: '导入已验证' })).toBeVisible()
  await page.getByRole('button', { name: '作为新草稿打开' }).click()
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
  const homeResults = await new AxeBuilder({ page }).analyze()
  expect(homeResults.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])

  await page.getByRole('button', { name: '草稿库' }).click()
  const dashboardResults = await new AxeBuilder({ page }).analyze()
  expect(dashboardResults.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])

  await page.getByRole('button', { name: '文章', exact: true }).focus()
  await expect(page.getByRole('button', { name: '文章', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await fillMetadata(page)
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
  await expect(page.getByRole('tablist', { name: '工作区视图' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(page.locator('[role="tabpanel"]')).toHaveCount(2)
  const expectNoHorizontalOverflow = () => expect(page.locator('html').evaluate((element) => element.scrollWidth <= window.innerWidth)).resolves.toBe(true)
  await expectNoHorizontalOverflow()
  await page.getByRole('tab', { name: '写作' }).click()
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toBeVisible()
  await expectNoHorizontalOverflow()
  await page.getByRole('button', { name: '预览文章' }).click()
  await expect(page.getByTitle('IMX 文章预览')).toBeVisible()
  await expectNoHorizontalOverflow()
  await page.getByRole('button', { name: '返回编辑' }).click()
  await page.getByRole('tab', { name: '设置' }).click()
  await expect(page.getByLabel('标题')).toHaveValue(ARTICLE_TITLE)
  await expectNoHorizontalOverflow()
})

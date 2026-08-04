import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Download, type Page } from '@playwright/test'
import { pngFile } from '../helpers/test-images'

const ARTICLE_TITLE = '浏览器中的 IMX 图片工作流'
const ARTICLE_SLUG = 'imx-browser-workflow'
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
  await page.getByRole('button', { name: '新建文章' }).click()
  await expect(page.getByRole('region', { name: '文章工作区' })).toBeVisible()
}

async function fillMetadata(page: Page): Promise<void> {
  await page.getByLabel('标题').fill(ARTICLE_TITLE)
  await page.getByLabel('Slug').fill(ARTICLE_SLUG)
  await page.getByLabel('摘要').fill('浏览器端 IMX 文章编辑与 Hugo 文章包测试。')
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

async function imageDimensions(page: Page, bytes: Uint8Array): Promise<{ width: number; height: number; type: string }> {
  return page.evaluate(async ({ imageBytes }) => {
    const blob = new Blob([new Uint8Array(imageBytes)], { type: 'image/webp' })
    const bitmap = await createImageBitmap(blob)
    try {
      return { width: bitmap.width, height: bitmap.height, type: blob.type }
    } finally {
      bitmap.close()
    }
  }, { imageBytes: Array.from(bytes) })
}

test('authors, saves, reloads, exports, and reimports an IMX Hugo article bundle', async ({ page, browserName }) => {
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

  const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
  await expect(preview.locator('h1.article-title')).toHaveText(ARTICLE_TITLE)
  await expect(preview.getByRole('heading', { name: '文章目录', level: 2 })).toBeVisible()
  await expect(preview.locator('.toc')).toContainText('文章目录')
  await expect(preview.locator('table')).toContainText('WebP')
  await expect(preview.locator('blockquote')).toContainText('这是一段引用文字。')
  await expect(preview.locator('pre code')).toContainText('const answer = 42')
  await expect(preview.locator('img[src^="blob:"]')).toHaveCount(1)

  await expect(page.getByRole('status')).toContainText('已保存到本地草稿')
  await page.reload()
  await expect(page.getByRole('region', { name: '草稿库' })).toBeVisible()
  await expect(page.getByRole('heading', { name: ARTICLE_TITLE })).toBeVisible()
  await page.getByRole('button', { name: '打开' }).click()
  await expect(page.getByLabel('标题')).toHaveValue(ARTICLE_TITLE)
  await expect(page.getByLabel('Slug')).toHaveValue(ARTICLE_SLUG)
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText('const answer = 42')

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
  if (browserName === 'chromium') {
    const dimensions = await imageDimensions(page, cover!)
    expect(dimensions.type).toBe('image/webp')
    expect(dimensions.width).toBeLessThanOrEqual(1600)
    expect(dimensions.height).toBeLessThanOrEqual(900)
    expect(dimensions.width / dimensions.height).toBe(16 / 9)
  }

  await page.getByRole('button', { name: '新建文章' }).click()
  await expect(page.getByLabel('标题')).toHaveValue('')
  await page.getByLabel('导入 ZIP').setInputFiles({
    name: `${ARTICLE_SLUG}.zip`,
    mimeType: 'application/zip',
    buffer: productionZip.archive,
  })
  await expect(page.getByRole('dialog', { name: '导入已验证' })).toBeVisible()
  await page.getByRole('button', { name: '作为新草稿打开' }).click()
  await expect(page.getByLabel('标题')).toHaveValue(ARTICLE_TITLE)
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText('![workflow](images/workflow.png)')
  await expect(page.getByLabel('已添加图片')).toContainText('workflow.png')

  const roundTripDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出草稿' }).click()
  const roundTripZip = await readZip(await roundTripDownload)
  expect(sha256(roundTripZip.entries.get(`${ARTICLE_SLUG}/images/cover.webp`)!)).toBe(sha256(cover!))
  expect(sha256(roundTripZip.entries.get(`${ARTICLE_SLUG}/images/workflow.png`)!)).toBe(sha256(bodyImage!))
})

test('has no serious or critical axe violations on the dashboard and workspace', async ({ page }) => {
  await page.goto('/')
  const dashboardResults = await new AxeBuilder({ page }).analyze()
  expect(dashboardResults.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])

  await page.getByRole('button', { name: '新建文章' }).focus()
  await expect(page.getByRole('button', { name: '新建文章' })).toBeFocused()
  await page.keyboard.press('Enter')
  await fillMetadata(page)
  // The preview deliberately has no script permission, so axe cannot inject into
  // that sandbox. The workspace scan covers every authoring control around it.
  const workspaceResults = await new AxeBuilder({ page }).exclude('iframe').analyze()
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

test('keeps all responsive workspace tabs mounted without horizontal overflow', async ({ page }) => {
  await beginArticle(page)
  await fillMetadata(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('tablist', { name: '工作区视图' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(3)
  await expect(page.locator('[role="tabpanel"]')).toHaveCount(3)
  expect(await page.locator('html').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('tab', { name: '写作' }).click()
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toBeVisible()
  await page.getByRole('tab', { name: '预览' }).click()
  await expect(page.getByTitle('IMX 文章预览')).toBeVisible()
  await page.getByRole('tab', { name: '设置' }).click()
  await expect(page.getByLabel('标题')).toHaveValue(ARTICLE_TITLE)
})

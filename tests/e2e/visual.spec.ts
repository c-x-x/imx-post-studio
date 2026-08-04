import { expect, test, type Page } from '@playwright/test'
import { pngFile } from '../helpers/test-images'

const sampleBody = [
  '## 预览层级',
  '',
  'IMX Post Studio 的浏览器预览使用固定的主题资源和本地图片。',
  '',
  '### 表格与说明',
  '',
  '| 检查项 | 结果 |',
  '| --- | --- |',
  '| 目录 | 已显示 |',
  '| 字体 | 已加载 |',
  '',
  '> 引用应具有 IMX 的边框、间距和阅读排版。',
  '',
  '```ts',
  'const preview = "IMX"',
  '```',
  '',
  '- 列表项一',
  '- 列表项二',
].join('\n')

async function seedPreview(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fixed = Date.parse('2026-08-04T01:00:00.000Z')
    const NativeDate = Date
    class FixedDate extends NativeDate {
      constructor(value?: string | number | Date) {
        super(value === undefined ? fixed : value)
      }

      static now(): number { return fixed }
    }
    Object.defineProperty(window, 'Date', { configurable: true, value: FixedDate })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '新建文章' }).click()
  await page.getByLabel('标题').fill('IMX 文章预览基线')
  await page.getByLabel('Slug').fill('imx-visual-baseline')
  await page.getByLabel('摘要').fill('稳定的 IMX 视觉回归基线。')
  await page.getByLabel('分类', { exact: true }).fill('设计')
  await page.getByLabel('分类', { exact: true }).press('Enter')
  await page.getByLabel('标签', { exact: true }).fill('视觉测试')
  await page.getByLabel('标签', { exact: true }).press('Enter')
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill(sampleBody)
  await page.getByLabel('添加正文图片').setInputFiles(pngFile('visual.png', 640, 360, [117, 76, 172, 255]))
  await page.getByRole('listitem', { name: 'visual.png' }).getByRole('button', { name: '插入' }).click()
  await expect(page.frameLocator('iframe[title="IMX 文章预览"]').locator('img[src^="blob:"]')).toHaveCount(1)
}

const visualOptions = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  scale: 'css' as const,
  // Chromium text anti-aliasing varies slightly between Darwin and Linux even
  // with bundled IMX fonts; cap a comparison at 1% changed pixels.
  maxDiffPixelRatio: 0.01,
  threshold: 0.2,
}

async function assertPreviewCaptureReady(page: Page, viewport: 'desktop' | 'mobile'): Promise<void> {
  const iframe = page.getByTitle('IMX 文章预览')
  const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
  const expectedWidth = viewport === 'desktop' ? 1024 : 390

  await expect.poll(() => iframe.evaluate((element) => element.clientWidth)).toBeGreaterThanOrEqual(expectedWidth)
  await expect.poll(() => preview.locator('html').evaluate((root) => root.ownerDocument.defaultView?.innerWidth ?? 0)).toBeGreaterThanOrEqual(expectedWidth)
  await expect.poll(() => preview.locator('body').evaluate((body) => body.getBoundingClientRect().width)).toBeGreaterThanOrEqual(expectedWidth)
  await expect(preview.getByRole('heading', { name: '预览层级', level: 2 })).toBeVisible()
  await expect(preview.getByRole('heading', { name: '表格与说明', level: 3 })).toBeVisible()
  await expect(preview.locator('table')).toBeVisible()
  await expect(preview.locator('blockquote')).toBeVisible()
  await expect(preview.locator('pre code')).toBeVisible()
  await expect(preview.locator('.article-content ul li')).toHaveCount(2)
  await expect(preview.locator('img[src^="blob:"]')).toHaveCount(1)
  expect(await preview.locator('img[src^="blob:"]').evaluate((image) => ({
    complete: (image as HTMLImageElement).complete,
    width: (image as HTMLImageElement).naturalWidth,
    height: (image as HTMLImageElement).naturalHeight,
  }))).toEqual({ complete: true, width: 640, height: 360 })
  await expect.poll(() => preview.locator('html').evaluate((root) => {
    const document = root.ownerDocument
    return Math.ceil(Math.max(root.scrollHeight, document.body.scrollHeight)) <= window.innerHeight
  })).toBe(true)
}

test.describe('IMX visual regressions', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium owns approved screenshot baselines.')
  })

  test('loads meaningful content without a Vite error overlay', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'IMX Post Studio' })).toBeVisible()
    await expect(page.locator('.vite-error-overlay, [data-nextjs-dialog], #webpack-dev-server-client-overlay')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '新建文章' })).toBeVisible()
    await expect(page.getByRole('button', { name: '草稿库' })).toBeVisible()
    await expect(page.locator('main')).toHaveScreenshot('app-shell-gut-check.png', visualOptions)
  })

  test('matches the light desktop article preview', async ({ page }) => {
    await seedPreview(page)
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await assertPreviewCaptureReady(page, 'desktop')
    await expect(preview.locator('body')).toHaveScreenshot('imx-preview-light-desktop.png', visualOptions)
  })

  test('matches the dark desktop article preview', async ({ page }) => {
    await seedPreview(page)
    await page.getByRole('button', { name: '深色预览' }).click()
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await expect(preview.locator('html')).toHaveAttribute('data-theme', 'dark')
    await assertPreviewCaptureReady(page, 'desktop')
    await expect(preview.locator('body')).toHaveScreenshot('imx-preview-dark-desktop.png', visualOptions)
  })

  test('matches the light mobile article preview', async ({ page }) => {
    await seedPreview(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('tab', { name: '预览' }).click()
    await page.getByRole('button', { name: '移动预览' }).click()
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await assertPreviewCaptureReady(page, 'mobile')
    await expect(preview.locator('body')).toHaveScreenshot('imx-preview-light-mobile.png', visualOptions)
  })

  test('matches the dark mobile article preview', async ({ page }) => {
    await seedPreview(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('tab', { name: '预览' }).click()
    await page.getByRole('button', { name: '移动预览' }).click()
    await page.getByRole('button', { name: '深色预览' }).click()
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await assertPreviewCaptureReady(page, 'mobile')
    await expect(preview.locator('body')).toHaveScreenshot('imx-preview-dark-mobile.png', visualOptions)
  })
})

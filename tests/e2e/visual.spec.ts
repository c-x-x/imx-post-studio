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
    await expect(page.locator('main')).toHaveScreenshot('app-shell-gut-check.png', { animations: 'disabled', caret: 'hide', scale: 'css' })
  })

  test('matches the light desktop article preview', async ({ page }) => {
    await seedPreview(page)
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await expect(preview.locator('body')).toHaveScreenshot('imx-preview-light-desktop.png', { animations: 'disabled', caret: 'hide', scale: 'css' })
  })

  test('matches the dark desktop article preview', async ({ page }) => {
    await seedPreview(page)
    await page.getByRole('button', { name: '深色预览' }).click()
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await expect(preview.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(preview.locator('body')).toHaveScreenshot('imx-preview-dark-desktop.png', { animations: 'disabled', caret: 'hide', scale: 'css' })
  })

  test('matches the light mobile article preview', async ({ page }) => {
    await seedPreview(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('tab', { name: '预览' }).click()
    await page.getByRole('button', { name: '移动预览' }).click()
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await expect(preview.locator('body')).toHaveScreenshot('imx-preview-light-mobile.png', { animations: 'disabled', caret: 'hide', scale: 'css' })
  })

  test('matches the dark mobile article preview', async ({ page }) => {
    await seedPreview(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('tab', { name: '预览' }).click()
    await page.getByRole('button', { name: '移动预览' }).click()
    await page.getByRole('button', { name: '深色预览' }).click()
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await expect(preview.locator('body')).toHaveScreenshot('imx-preview-dark-mobile.png', { animations: 'disabled', caret: 'hide', scale: 'css' })
  })
})

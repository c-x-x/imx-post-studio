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
  await page.getByRole('button', { name: '文章', exact: true }).click()
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
  await expect(page.getByTitle('IMX 文章预览')).toHaveCount(0)
  await page.getByRole('button', { name: '预览文章' }).click()
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

async function openPreviewCapturePage(page: Page, viewport: 'desktop' | 'mobile'): Promise<Page> {
  const srcDoc = await page.getByTitle('IMX 文章预览').getAttribute('srcdoc')
  if (!srcDoc) throw new Error('IMX preview did not expose srcDoc for visual capture')

  const capturePage = await page.context().newPage()
  await capturePage.setViewportSize({ width: viewport === 'desktop' ? 1180 : 390, height: 900 })
  await capturePage.goto('/')
  await capturePage.setContent(srcDoc, { waitUntil: 'load' })
  await expect.poll(() => capturePage.evaluate(() => location.origin)).toBe('http://127.0.0.1:4173')
  return capturePage
}

async function assertPreviewCaptureReady(capturePage: Page, viewport: 'desktop' | 'mobile'): Promise<void> {
  const expectedWidth = viewport === 'desktop' ? 1180 : 390

  await expect.poll(() => capturePage.evaluate(() => window.innerWidth)).toBe(expectedWidth)
  await expect(capturePage.getByRole('heading', { name: '预览层级', level: 2 })).toBeVisible()
  await expect(capturePage.getByRole('heading', { name: '表格与说明', level: 3 })).toBeVisible()
  await expect(capturePage.locator('table')).toBeVisible()
  await expect(capturePage.locator('blockquote')).toBeVisible()
  await expect(capturePage.locator('pre code')).toBeVisible()
  await expect(capturePage.locator('.article-content ul li')).toHaveCount(2)
  await expect(capturePage.locator('img[src^="blob:"]')).toHaveCount(1)
  expect(await capturePage.locator('img[src^="blob:"]').evaluate((image) => ({
    complete: (image as HTMLImageElement).complete,
    width: (image as HTMLImageElement).naturalWidth,
    height: (image as HTMLImageElement).naturalHeight,
  }))).toEqual({ complete: true, width: 640, height: 360 })
  const fontProof = await capturePage.evaluate(async () => {
    await document.fonts.ready
    const [interFaces, notoFaces] = await Promise.all([
      document.fonts.load('400 1em "IMX Inter"', 'IMX'),
      document.fonts.load('400 1em "IMX Noto Serif SC"', '预览'),
    ])
    return {
      inter: interFaces.some((face) => face.family.replaceAll('"', '') === 'IMX Inter' && face.status === 'loaded'),
      noto: notoFaces.some((face) => face.family.replaceAll('"', '') === 'IMX Noto Serif SC' && face.status === 'loaded'),
    }
  })
  expect(fontProof).toEqual({ inter: true, noto: true })

  if (viewport === 'desktop') {
    expect(await capturePage.locator('.toc').evaluate((toc) => {
      const tocBoxes = [toc, toc.querySelector('.toc-title'), toc.querySelector('nav')]
        .filter((element): element is Element => element !== null)
        .map((element) => element.getBoundingClientRect())
      return tocBoxes.length === 3 && tocBoxes.every((bounds) => bounds.width > 0
        && bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.top >= 0)
    })).toBe(true)
  }

  if (viewport === 'mobile') {
    expect(await capturePage.locator('.article-tools').evaluate((tools) => {
      const toolBounds = tools.getBoundingClientRect()
      return [...document.querySelectorAll('.article-content > *')].every((content) => {
        const contentBounds = content.getBoundingClientRect()
        const hasArea = contentBounds.width > 0 && contentBounds.height > 0
        const intersects = toolBounds.left < contentBounds.right
          && toolBounds.right > contentBounds.left
          && toolBounds.top < contentBounds.bottom
          && toolBounds.bottom > contentBounds.top
        return !hasArea || !intersects
      })
    })).toBe(true)
  }
}

async function matchPreviewScreenshot(page: Page, name: string, viewport: 'desktop' | 'mobile'): Promise<void> {
  const capturePage = await openPreviewCapturePage(page, viewport)
  try {
    await assertPreviewCaptureReady(capturePage, viewport)
    await expect(capturePage).toHaveScreenshot(name, { ...visualOptions, fullPage: true })
  } finally {
    await capturePage.close()
  }
}

test.describe('IMX visual regressions', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium owns approved screenshot baselines.')
  })

  test('loads meaningful content with the IMX application shell and no Vite error overlay', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'IMX Post Studio' })).toBeVisible()
    await expect(page.locator('.vite-error-overlay, [data-nextjs-dialog], #webpack-dev-server-client-overlay')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '文章', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Markdown 语法速查' })).toBeVisible()
    await expect(page.getByRole('button', { name: '草稿库' })).toBeVisible()
    const shellStyle = await page.locator('.imx-dock').evaluate((dock) => {
      const dockStyle = getComputedStyle(dock)
      const containerStyle = getComputedStyle(dock.querySelector('.imx-dock__container')!)
      const bodyStyle = getComputedStyle(document.body)
      return {
        bodyBackground: bodyStyle.backgroundColor,
        columns: containerStyle.gridTemplateColumns.split(' ').length,
        fontFamily: dockStyle.fontFamily,
        position: dockStyle.position,
      }
    })
    expect(shellStyle).toMatchObject({
      bodyBackground: 'rgb(242, 239, 232)',
      columns: 3,
      position: 'fixed',
    })
    expect(shellStyle.fontFamily).toContain('IMX Inter')
  })

  test('matches the light desktop article preview', async ({ page }) => {
    await seedPreview(page)
    await expect(page.locator('.preview-surface')).toHaveScreenshot('imx-preview-shell-light-desktop.png', visualOptions)
    await matchPreviewScreenshot(page, 'imx-preview-light-desktop.png', 'desktop')
  })

  test('matches the dark desktop article preview', async ({ page }) => {
    await seedPreview(page)
    await page.getByRole('button', { name: '深色预览' }).click()
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await expect(preview.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await preview.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor)).toBe('rgb(21, 21, 19)')
    expect(await preview.locator('.article-content').evaluate((content) => getComputedStyle(content).color)).toBe('rgb(227, 220, 210)')
    expect(await preview.locator('.article-meta').evaluate((meta) => getComputedStyle(meta).color)).toBe('rgb(183, 174, 162)')
    expect(await preview.locator('.toc a').first().evaluate((link) => ({
      color: getComputedStyle(link).color,
      opacity: getComputedStyle(link).opacity,
    }))).toEqual({ color: 'rgb(200, 191, 179)', opacity: '1' })
    await expect(page.locator('.preview-surface')).toHaveScreenshot('imx-preview-shell-dark-desktop.png', visualOptions)
    await matchPreviewScreenshot(page, 'imx-preview-dark-desktop.png', 'desktop')
  })

  test('matches the light mobile article preview', async ({ page }) => {
    await seedPreview(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '移动预览' }).click()
    await expect(page.locator('.preview-surface')).toHaveScreenshot('imx-preview-shell-light-mobile.png', visualOptions)
    await matchPreviewScreenshot(page, 'imx-preview-light-mobile.png', 'mobile')
  })

  test('matches the dark mobile article preview', async ({ page }) => {
    await seedPreview(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '移动预览' }).click()
    await page.getByRole('button', { name: '深色预览' }).click()
    const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
    await expect(preview.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.preview-surface')).toHaveScreenshot('imx-preview-shell-dark-mobile.png', visualOptions)
    await matchPreviewScreenshot(page, 'imx-preview-dark-mobile.png', 'mobile')
  })
})

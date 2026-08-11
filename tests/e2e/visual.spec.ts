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

async function seedPreview(page: Page, body = sampleBody): Promise<void> {
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
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill(body)
  await page.getByLabel('添加正文图片').setInputFiles(pngFile('visual.png', 640, 360, [117, 76, 172, 255]))
  await page.getByRole('listitem', { name: 'visual.png' }).getByRole('button', { name: '插入' }).click()
  await expect(page.getByTitle('IMX 文章预览')).toHaveCount(0)
  await page.getByRole('button', { name: '预览文章' }).click()
  await expect(page.getByTitle('IMX 文章预览').locator('img[src^="blob:"]')).toHaveCount(1)
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
    await expect(page.getByRole('heading', { name: 'I am no bird; and no net ensnares me.' })).toBeVisible()
    await expect(page.getByText('Charlotte Brontë · Jane Eyre')).toBeVisible()
    await expect(page.getByText('Hugo 输出')).toHaveCount(0)
    await expect(page.getByText('IMX 预览')).toHaveCount(0)
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
      bodyBackground: 'rgb(251, 250, 247)',
      columns: 3,
      position: 'fixed',
    })
    expect(shellStyle.fontFamily).toContain('IMX Inter')
  })

  test('uses the IMX-style card and primary-action primitives outside the Dock', async ({ page }) => {
    await page.goto('/')
    const surfaces = await page.locator('.home-hero').evaluate((hero) => {
      const heroStyle = getComputedStyle(hero)
      const actionStyle = getComputedStyle(document.querySelector('.home-primary')!)
      return {
        cardRadius: heroStyle.borderRadius,
        cardShadow: heroStyle.boxShadow,
        primaryBackground: actionStyle.backgroundImage,
      }
    })

    expect(surfaces).toEqual({
      cardRadius: '26px',
      cardShadow: 'rgba(75, 64, 52, 0.11) 0px 2px 8px 0px',
      primaryBackground: 'linear-gradient(135deg, rgb(139, 103, 64) 0%, rgb(86, 61, 33) 100%)',
    })
  })

  test('renders semantic emphasis with real regular and bold preview fonts', async ({ page }) => {
    await seedPreview(page, '**粗体正文**、*斜体正文*、~~删除线正文~~。')
    const preview = page.getByTitle('IMX 文章预览')
    await expect(preview.locator('.article-content strong')).toHaveText('粗体正文')
    await expect(preview.locator('.article-content em')).toHaveText('斜体正文')
    await expect(preview.locator('.article-content del')).toHaveText('删除线正文')

    const proof = await preview.locator('.article-content').evaluate(async (content) => {
      await document.fonts.ready
      const [regularFaces, boldFaces] = await Promise.all([
        document.fonts.load('400 1em "IMX Noto Serif SC"', '正文'),
        document.fonts.load('700 1em "IMX Noto Serif SC"', '粗体'),
      ])
      const strong = content.querySelector('strong')
      const emphasis = content.querySelector('em')
      const deleted = content.querySelector('del')
      return {
        regularLoaded: regularFaces.some((face) => face.family.replaceAll('"', '') === 'IMX Noto Serif SC' && face.weight === '400' && face.status === 'loaded'),
        boldLoaded: boldFaces.some((face) => face.family.replaceAll('"', '') === 'IMX Noto Serif SC' && face.weight === '700' && face.status === 'loaded'),
        strongWeight: strong ? getComputedStyle(strong).fontWeight : '',
        emphasisStyle: emphasis ? getComputedStyle(emphasis).fontStyle : '',
        deletionLine: deleted ? getComputedStyle(deleted).textDecorationLine : '',
      }
    })

    expect(proof).toEqual({
      regularLoaded: true,
      boldLoaded: true,
      strongWeight: '700',
      emphasisStyle: 'italic',
      deletionLine: 'line-through',
    })
  })

  test('uses the approved dark preview palette', async ({ page }) => {
    await seedPreview(page)
    await page.getByRole('button', { name: '深色预览' }).click()
    const preview = page.getByTitle('IMX 文章预览')
    await expect(preview.locator('.preview-html')).toHaveAttribute('data-theme', 'dark')
    await expect(preview.locator('.preview-body')).toHaveCSS('background-color', 'rgb(23, 23, 22)')
    await expect(preview.locator('.article-content')).toHaveCSS('color', 'rgb(238, 234, 227)')
    await expect(preview.locator('.article-meta')).toHaveCSS('color', 'rgb(143, 137, 130)')
    const inactiveTocLink = preview.locator('.toc a:not(.active)').first()
    await expect(inactiveTocLink).toHaveCSS('color', 'rgb(143, 137, 130)')
    await expect(inactiveTocLink).toHaveCSS('opacity', '0.58')
  })
})

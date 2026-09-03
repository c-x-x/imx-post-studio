import { expect, test, type Page } from '@playwright/test'
import { pngFile } from '../helpers/test-images'
import { setEditorMode } from '../helpers/editor-mode'

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
  await page.getByRole('button', { name: '写作', exact: true }).click()
  await page.getByLabel('标题').fill('IMX 文章预览基线')
  await page.getByLabel('Slug').fill('imx-visual-baseline')
  await page.getByLabel('摘要').fill('稳定的 IMX 视觉回归基线。')
  await page.getByLabel('分类', { exact: true }).fill('设计')
  await page.getByLabel('分类', { exact: true }).press('Enter')
  await page.getByLabel('标签', { exact: true }).fill('视觉测试')
  await page.getByLabel('标签', { exact: true }).press('Enter')
  await page.getByRole('tab', { name: '排版' }).click()
  await setEditorMode(page, 'source')
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await expect(editor.locator('.cm-line').first()).toBeVisible()
  await editor.fill(body)
  await setEditorMode(page, 'rich')
  await page.getByRole('tab', { name: '文档' }).click()
  await page.getByLabel('添加正文图片').setInputFiles(pngFile('visual.png', 640, 360, [117, 76, 172, 255]))
  await page.getByRole('listitem', { name: 'visual.png' }).getByRole('button', { name: '插入' }).click()
  await expect(page.getByTitle('IMX 文章预览')).toHaveCount(0)
  await page.getByRole('button', { name: '预览文章' }).click()
  await expect(page.getByTitle('IMX 文章预览').locator('img[src^="blob:"]')).toHaveCount(1)
}

test.describe('Preview typography and contrast', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Supplemental font and palette checks run once in Chromium.')
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
        regularLoaded: regularFaces.some((face) => face.family.replaceAll('"', '') === 'IMX Noto Serif SC' && face.status === 'loaded'),
        boldLoaded: boldFaces.some((face) => face.family.replaceAll('"', '') === 'IMX Noto Serif SC' && face.status === 'loaded'),
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

  test('keeps WenKai bold text distinct by allowing synthetic weight', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('imx-post-studio:preferences:v1', JSON.stringify({ editorFont: 'wenkai' }))
    })
    await page.goto('/')
    await page.getByRole('button', { name: '写作', exact: true }).click()
    await setEditorMode(page, 'source')
    await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('正常 **粗体**')
    await setEditorMode(page, 'rich')

    const editor = page.locator('.markdown-editor')
    const strong = editor.locator('.tiptap strong')
    await expect(editor).toHaveAttribute('data-font', 'wenkai')
    await expect(strong).toHaveText('粗体')
    await expect(strong).toHaveCSS('font-weight', '700')
    const synthesis = await editor.locator('.tiptap').evaluate((element) => getComputedStyle(element).fontSynthesis)
    expect(synthesis).toContain('weight')
  })

  test('uses the approved dark preview palette', async ({ page }) => {
    await seedPreview(page)
    await page.locator('.preview-surface').getByRole('button', { name: '切换到深色主题' }).click()
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

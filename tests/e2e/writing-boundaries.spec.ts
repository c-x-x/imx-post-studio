import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { setEditorMode } from '../helpers/editor-mode'
import { pngFile } from '../helpers/test-images'

async function openWriter(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
}

async function source(page: Page, markdown: string) {
  await setEditorMode(page, 'source')
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill(markdown)
  await setEditorMode(page, 'rich')
}

test('keeps multi-paragraph footnotes in the footnote after a mode round trip', async ({ page }) => {
  await openWriter(page)
  await source(page, '正文[^n]\n\n[^n]: 第一行\n\n    第二行\n\n后文')
  await expect(page.locator('.footnote-definition-view')).toContainText('第二行')
  await page.getByRole('button', { name: '预览文章' }).click()
  const preview = page.getByTitle('IMX 文章预览')
  await expect(preview.locator('.footnotes')).toContainText('第二行')
  await expect(preview.locator('.footnotes')).not.toContainText('后文')
  await expect(preview.locator('.highlight')).toHaveCount(0)
})

test('edits escaped alt text and resolves local image suffixes in editor and preview', async ({ page }) => {
  await openWriter(page)
  await page.getByLabel('添加正文图片').setInputFiles(pngFile('a.png', 32, 32, [50, 90, 150, 255]))
  await expect(page.getByRole('listitem', { name: 'a.png' })).toBeVisible()
  await source(page, '![a\\]b](images/a.png?v=1#hero)')
  const preview = page.getByLabel('图片预览')
  await expect(preview.locator('img')).toHaveAttribute('src', /^blob:/)
  await preview.click()
  const input = page.getByLabel('图片 Markdown 源码')
  await expect(input).toHaveValue('![a\\]b](images/a.png?v=1#hero)')
  await input.fill('![A\\]b](images/a.png?v=1#hero)')
  await expect(preview.locator('img')).toHaveAttribute('alt', 'A]b')
  await page.getByRole('button', { name: '预览文章' }).click()
  await expect(page.getByTitle('IMX 文章预览').getByRole('img', { name: 'A]b' })).toHaveAttribute('src', /^blob:/)
})

test('downloads and imports an unnamed draft through the normal document tools', async ({ page, context }) => {
  await openWriter(page)
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('未完成也要保留的正文')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '备份草稿' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('untitled-draft.zip')
  const buffer = await readFile((await download.path())!)
  const restored = await context.newPage()
  await openWriter(restored)
  await restored.getByLabel('导入文章包').setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer })
  await restored.getByRole('button', { name: '作为新草稿打开' }).click()
  await expect(restored.getByLabel('标题', { exact: true })).toHaveValue('')
  await expect(restored.getByLabel('Slug', { exact: true })).toHaveValue('')
  await expect(restored.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText('未完成也要保留的正文')
  await restored.close()
})

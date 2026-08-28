import { expect, test } from '@playwright/test'

test('defers typed Markdown until leaving the paragraph and keeps toolbar formatting immediate', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '写作', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.click()
  for (const level of [1, 2, 3, 4, 5, 6]) {
    await editor.pressSequentially(`${'#'.repeat(level)} 标题${level}`)
    await expect(editor.locator(`h${level}`)).toHaveCount(0)
    await expect(editor.locator('.editor-markdown-marker')).toContainText('#'.repeat(level))
    await editor.press('Enter')
    await expect(editor.locator(`h${level}`)).toHaveText(`标题${level}`)
  }
  await editor.pressSequentially('**中文加粗** *中文斜体* ~~删除文字~~')
  await expect(editor.locator('strong, em, s')).toHaveCount(0)
  await editor.locator('h1').click()
  await expect(editor.locator('strong')).toHaveText('中文加粗')
  await expect(editor.locator('em')).toHaveText('中文斜体')
  await expect(editor.locator('s')).toHaveText('删除文字')
  await page.getByRole('tab', { name: '排版' }).click()
  await page.getByRole('button', { name: '二级标题' }).click()
  await expect(editor.locator('h2')).toHaveCount(2)
  await page.getByRole('button', { name: '源代码', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText('~~删除文字~~')
  await expect(page.getByRole('textbox', { name: 'Markdown 编辑器' })).not.toContainText('\\*')
})

import { expect, type Page } from '@playwright/test'

export async function setEditorMode(page: Page, mode: 'rich' | 'source'): Promise<void> {
  await page.getByRole('button', { name: '打开设置' }).click()
  const dialog = page.getByRole('dialog', { name: '设置' })
  await dialog.getByRole('tab', { name: '编辑器' }).click()
  await dialog.getByRole('radio', { name: mode === 'source' ? /源代码/ : /即时排版/ }).check()
  await dialog.getByRole('button', { name: '关闭' }).click()
  await expect(page.locator('.markdown-editor')).toHaveAttribute('data-mode', mode)
}

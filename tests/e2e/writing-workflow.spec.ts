import { expect, test, type Page } from '@playwright/test'

async function navigate(page: Page, name: string) {
  const button = page.getByRole('navigation', { name: 'Studio 导航' }).getByRole('button', { name, exact: true })
  if (page.viewportSize()!.width <= 768) await page.getByRole('button', { name: '打开菜单' }).click()
  await button.click()
}

test('both new-article decisions reset the real editor and preserve only saved drafts', { tag: '@critical' }, async ({ page }) => {
  await page.goto('/')
  await navigate(page, '写作')
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await page.getByLabel('标题').fill('保留这篇')
  await editor.fill('第一篇正文')
  await page.getByRole('button', { name: '新建文章', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿并新建' }).click()
  await expect(editor).toHaveText('')
  await expect(page.getByLabel('标题')).toHaveValue('')
  await editor.fill('第二篇不要保留')
  await expect(page.getByRole('status')).toContainText('已保存到本地草稿')
  await page.getByRole('button', { name: '新建文章', exact: true }).click()
  await page.getByRole('button', { name: '删除草稿并继续' }).click()
  await expect(editor).toHaveText('')
  await navigate(page, '草稿')
  const local = page.getByRole('region', { name: '本地草稿', exact: true })
  await expect(local.getByRole('listitem')).toHaveCount(1)
  await expect(local).toContainText('保留这篇')
  await local.getByRole('button', { name: '打开', exact: true }).click()
  await expect(editor).toHaveText('第一篇正文')
})

test('works → pending → failed/successful push preserves then deletes the actual draft', { tag: '@critical' }, async ({ page }) => {
  let source = '+++\ntitle = "Remote article"\ndate = "2026-08-27T10:00:00+08:00"\ndescription = "Article summary"\ndraft = false\n+++\nOriginal body'
  let revision = 'a'.repeat(40)
  let failPush = true
  let pushed = 0
  await page.route('**/api/github/**', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1)
    let json: unknown
    if (action === 'session') json = { configured: true, user: { id: 123, login: 'owner' }, csrf: 'test', repository: { name: 'owner/blog', branch: 'main', contentRoot: 'content/posts' } }
    else if (action === 'list') json = { commit: revision, articles: [{ path: 'content/posts/remote/index.md', slug: 'remote' }] }
    else if (action === 'article') json = { path: 'content/posts/remote/index.md', ref: 'main', commit: revision, images: [], source }
    else if (action === 'save') {
      const input = route.request().postDataJSON()
      expect(input.mode).toBe('direct')
      expect(input.ref).toBe('main')
      if (failPush) return route.fulfill({ status: 409, json: { error: '模拟远端冲突，草稿仍保留' } })
      source = input.source
      revision = 'b'.repeat(40)
      pushed += 1
      json = { ref: 'main', commit: revision, url: 'https://github.com/owner/blog/commit/' + revision }
    } else throw new Error('Unexpected GitHub API: ' + action)
    await route.fulfill({ json })
  })
  await page.goto('/')
  await navigate(page, '作品')
  await page.getByRole('button', { name: '读取并编辑' }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 编辑器' })
  await editor.fill('Updated body')
  await expect(page.getByRole('status')).toContainText('已保存到待提交作品')
  await navigate(page, '草稿')
  await expect(page.getByRole('region', { name: '本地草稿', exact: true }).getByRole('listitem')).toHaveCount(0)
  const pending = page.getByRole('region', { name: '待提交作品', exact: true })
  await expect(pending.getByRole('listitem')).toHaveCount(1)
  await pending.getByRole('button', { name: '打开', exact: true }).click()
  await page.getByRole('button', { name: '推送', exact: true }).click()
  await expect(page.getByRole('region', { name: 'GitHub 文章列表' })).toHaveCount(0)
  await page.getByRole('button', { name: '确认推送到 main' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟远端冲突')
  await page.getByRole('button', { name: '返回写作' }).click()
  await expect(editor).toHaveText('Updated body')
  failPush = false
  await page.getByRole('button', { name: '推送', exact: true }).click()
  await page.getByRole('button', { name: '确认推送到 main' }).click()
  await expect(page.getByRole('dialog', { name: '推送', exact: true })).toHaveCount(0)
  await expect(editor).toHaveText('')
  expect(pushed).toBe(1)
  await navigate(page, '草稿')
  await expect(page.locator('.draft-list li')).toHaveCount(0)
  await page.reload()
  await navigate(page, '草稿')
  await expect(page.locator('.draft-list li')).toHaveCount(0)
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await navigate(page, '作品')
    await expect(page.getByRole('button', { name: '读取并编辑' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width > 768) {
      const brand = await page.locator('.imx-dock__brand').boundingBox()
      const menu = await page.locator('.imx-dock__menu').boundingBox()
      expect(brand!.x + brand!.width).toBeLessThanOrEqual(menu!.x)
    }
  }
  await page.getByRole('button', { name: '读取并编辑' }).click()
  await page.getByRole('tab', { name: '写作', exact: true }).click()
  await expect(editor).toHaveText('Updated body')
})

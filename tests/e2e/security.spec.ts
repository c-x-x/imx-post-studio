import { readFile } from 'node:fs/promises'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { expect, test, type Page } from '@playwright/test'
import { oversizedPngFile, pngFile } from '../helpers/test-images'

const title = '需要保留的当前草稿'
const slug = 'preserve-current-draft'

async function beginArticle(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '新建文章' }).click()
  await page.getByLabel('标题').fill(title)
  await page.getByLabel('Slug').fill(slug)
  await page.getByLabel('摘要').fill('用于验证失败导入不会替换当前草稿。')
}

async function zipBuffer(entries: Array<{ name: string; contents: string }>): Promise<Buffer> {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  let closed = false
  try {
    for (const entry of entries) await writer.add(entry.name, new TextReader(entry.contents), { level: 0 })
    const blob = await writer.close()
    closed = true
    return Buffer.from(await blob.arrayBuffer())
  } finally {
    if (!closed) await writer.close().catch(() => undefined)
  }
}

test('sanitizes hostile preview HTML and preserves the sandboxed IMX document contract', async ({ page }) => {
  await beginArticle(page)
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill([
    '<script>window.__imx_xss = true</script>',
    '<a href="javascript:alert(1)" onclick="window.__imx_click = true">unsafe link</a>',
    '<img src="images/missing.png" onerror="window.__imx_image = true">',
  ].join('\n'))

  const iframe = page.getByTitle('IMX 文章预览')
  await expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin')
  await expect(iframe).not.toHaveAttribute('sandbox', /allow-scripts/)
  const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
  await expect(preview.locator('script')).toHaveCount(0)
  await expect(preview.locator('a', { hasText: 'unsafe link' })).not.toHaveAttribute('href')
  await expect(preview.locator('[onclick], [onerror]')).toHaveCount(0)
  await expect(preview.locator('img')).toHaveCount(1)
  await expect(preview.locator('img')).not.toHaveAttribute('src')
  const fontProof = await preview.locator('body').evaluate(async (body) => {
    await document.fonts.ready
    const heading = body.querySelector('.article-title')
    const content = body.querySelector('.article-content')
    return Boolean(heading && content
      && getComputedStyle(heading).fontFamily.includes('IMX Inter')
      && getComputedStyle(content).fontFamily.includes('IMX Noto Serif SC'))
  })
  expect(fontProof).toBe(true)
})

test('rejects SVG and oversized media, blocks missing media export, and keeps current content after hostile ZIP imports', async ({ page }) => {
  await beginArticle(page)
  const imageInput = page.getByLabel('添加正文图片')
  await imageInput.setInputFiles({
    name: 'dangerous.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  })
  await expect(page.getByRole('alert')).toContainText('图片格式不受支持')
  await imageInput.setInputFiles(oversizedPngFile())
  await expect(page.getByRole('alert')).toContainText('单个图片不能超过 25 MiB')

  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('![丢失](images/missing.png)')
  await page.getByRole('button', { name: '导出文章' }).click()
  await page.getByRole('button', { name: '设为 draft = false' }).click()
  await expect(page.getByText('无法导出文章：缺少正文图片：images/missing.png')).toBeVisible()
  await expect(page.getByLabel('标题')).toHaveValue(title)

  const corruptToml = await zipBuffer([{ name: 'bad/index.md', contents: '+++\ntitle = [\n+++' }])
  await page.getByLabel('导入 ZIP').setInputFiles({ name: 'corrupt.toml.zip', mimeType: 'application/zip', buffer: corruptToml })
  await expect(page.getByText(/无法导入文章：Front Matter 解析失败/)).toBeVisible()
  await expect(page.getByLabel('标题')).toHaveValue(title)

  const zipSlip = await zipBuffer([
    { name: 'safe/index.md', contents: '+++\ntitle = "Unsafe"\ndate = "2026-08-04T09:00:00+08:00"\ndraft = true\n+++' },
    { name: '../escaped.md', contents: 'outside article root' },
  ])
  await page.getByLabel('导入 ZIP').setInputFiles({ name: 'zip-slip.zip', mimeType: 'application/zip', buffer: zipSlip })
  await expect(page.getByText('ZIP 导入失败：不安全的条目路径：../escaped.md')).toBeVisible()
  await expect(page.getByLabel('标题')).toHaveValue(title)
})

test('keeps an in-memory draft recoverable when IndexedDB fails and restores focus after recovery import', async ({ browser, page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: { open: () => { throw new DOMException('blocked by test', 'InvalidStateError') } },
    })
  })
  await beginArticle(page)
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('这份内容必须在本地存储故障后仍可恢复。')
  await expect(page.getByRole('alert')).toContainText('本地草稿保存失败')
  await expect(page.getByLabel('标题')).toHaveValue(title)

  const recoveryDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '紧急导出恢复备份' }).click()
  const recoveryPath = await (await recoveryDownload).path()
  if (!recoveryPath) throw new Error('The recovery download path is unavailable')
  const recoveryZip = await readFile(recoveryPath)

  const cleanContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce', viewport: { width: 1440, height: 900 },
  })
  try {
    const recovered = await cleanContext.newPage()
    await recovered.goto('/')
    await recovered.getByRole('button', { name: '新建文章' }).click()
    const recoveryInput = recovered.getByLabel('导入紧急恢复 ZIP')
    await recoveryInput.setInputFiles({ name: 'recovery.zip', mimeType: 'application/zip', buffer: recoveryZip })
    await expect(recovered.getByRole('dialog', { name: '导入已验证' })).toBeVisible()
    await recovered.getByRole('button', { name: '作为新草稿打开' }).click()
    await expect(recovered.getByLabel('标题')).toHaveValue(title)
    await expect(recovered.getByRole('textbox', { name: 'Markdown 编辑器' })).toContainText('本地存储故障后仍可恢复')
    await expect(recoveryInput).toBeFocused()
  } finally {
    await cleanContext.close()
  }
})

test('renders a real Blob body image inside the script-free preview iframe', async ({ page }) => {
  await beginArticle(page)
  await page.getByLabel('添加正文图片').setInputFiles(pngFile('blob-proof.png', 64, 36, [64, 158, 112, 255]))
  const image = page.getByRole('listitem', { name: 'blob-proof.png' })
  await image.getByRole('button', { name: '插入' }).click()
  const preview = page.frameLocator('iframe[title="IMX 文章预览"]')
  await expect(preview.locator('img[src^="blob:"]')).toHaveCount(1)
  await expect(preview.locator('script')).toHaveCount(0)
})

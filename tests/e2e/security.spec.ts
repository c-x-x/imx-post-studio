import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter, type FileEntry } from '@zip.js/zip.js'
import { expect, test, type Page } from '@playwright/test'
import { oversizedPngFile, pngFile } from '../helpers/test-images'

const title = '需要保留的当前草稿'
const slug = 'preserve-current-draft'

async function beginArticle(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '新建文章' }).click()
  await page.getByLabel('标题').fill(title)
  await page.getByLabel('Slug').fill(slug)
  await page.getByLabel('发布日期').fill('2026-08-04T12:34:56+08:00')
  await page.getByLabel('摘要').fill('用于验证失败导入不会替换当前草稿。')
  await page.getByLabel('分类', { exact: true }).fill('安全')
  await page.getByLabel('分类', { exact: true }).press('Enter')
  await page.getByLabel('标签', { exact: true }).fill('事务')
  await page.getByLabel('标签', { exact: true }).press('Enter')
  await page.getByLabel('显示目录').uncheck()
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

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function currentDraftFingerprint(page: Page): Promise<unknown> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出草稿' }).click()
  const path = await (await download).path()
  if (!path) throw new Error('The draft download path is unavailable')
  const reader = new ZipReader(new BlobReader(new Blob([await readFile(path)])))
  try {
    const files = (await reader.getEntries()).filter((entry): entry is FileEntry => !entry.directory)
    const index = files.find((entry) => entry.filename === `${slug}/index.md`)
    if (!index) throw new Error('Draft ZIP did not contain index.md')
    const media = await Promise.all(files
      .filter((entry) => entry.filename.startsWith(`${slug}/images/`))
      .map(async (entry) => {
      const bytes = new Uint8Array(await (await entry.getData(new BlobWriter())).arrayBuffer())
      return { name: entry.filename, sha256: sha256(bytes) }
    }))
    return {
      index: await index.getData(new TextWriter()),
      media: media.sort((left, right) => left.name.localeCompare(right.name)),
    }
  } finally {
    await reader.close()
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
    const [interFaces, notoFaces] = await Promise.all([
      document.fonts.load('400 1em "IMX Inter"', 'IMX'),
      document.fonts.load('400 1em "IMX Noto Serif SC"', '预览'),
    ])
    const heading = body.querySelector('.article-title')
    const content = body.querySelector('.article-content')
    return {
      inter: interFaces.some((face) => face.family.replaceAll('"', '') === 'IMX Inter' && face.status === 'loaded')
        && document.fonts.check('400 1em "IMX Inter"', 'IMX'),
      noto: notoFaces.some((face) => face.family.replaceAll('"', '') === 'IMX Noto Serif SC' && face.status === 'loaded')
        && document.fonts.check('400 1em "IMX Noto Serif SC"', '预览'),
      computed: Boolean(heading && content
        && getComputedStyle(heading).fontFamily.includes('IMX Inter')
        && getComputedStyle(content).fontFamily.includes('IMX Noto Serif SC')),
    }
  })
  expect(fontProof).toEqual({ inter: true, noto: true, computed: true })
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

  await imageInput.setInputFiles(pngFile('retain.png', 64, 36, [8, 40, 80, 255]))
  await expect(page.getByRole('listitem', { name: 'retain.png' })).toBeVisible()

  const retainedImage = page.getByRole('listitem', { name: 'retain.png' })
  await retainedImage.getByRole('button', { name: '插入' }).click()
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('![丢失](images/missing.png)')
  await page.getByRole('button', { name: '导出文章' }).click()
  await page.getByRole('button', { name: '设为 draft = false' }).click()
  await expect(page.getByText('无法导出文章：缺少正文图片：images/missing.png')).toBeVisible()
  await expect(page.getByLabel('标题')).toHaveValue(title)
  await page.getByRole('dialog', { name: '导出 Hugo 文章包' }).getByRole('button', { name: '取消' }).click()
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('![保留](images/retain.png)')

  const corruptToml = await zipBuffer([{ name: 'bad/index.md', contents: '+++\ntitle = [\n+++' }])
  const beforeCorruptToml = await currentDraftFingerprint(page)
  await page.getByLabel('导入 ZIP').setInputFiles({ name: 'corrupt.toml.zip', mimeType: 'application/zip', buffer: corruptToml })
  await expect(page.getByText(/无法导入文章：Front Matter 解析失败/)).toBeVisible()
  expect(await currentDraftFingerprint(page)).toEqual(beforeCorruptToml)

  const zipSlip = await zipBuffer([
    { name: 'safe/index.md', contents: '+++\ntitle = "Unsafe"\ndate = "2026-08-04T09:00:00+08:00"\ndraft = true\n+++' },
    { name: '../escaped.md', contents: 'outside article root' },
  ])
  const beforeZipSlip = await currentDraftFingerprint(page)
  await page.getByLabel('导入 ZIP').setInputFiles({ name: 'zip-slip.zip', mimeType: 'application/zip', buffer: zipSlip })
  await expect(page.getByText('ZIP 导入失败：不安全的条目路径：../escaped.md')).toBeVisible()
  expect(await currentDraftFingerprint(page)).toEqual(beforeZipSlip)

  const missingImage = await zipBuffer([{
    name: 'missing/index.md',
    contents: '+++\ntitle = "Missing"\ndate = "2026-08-04T09:00:00+08:00"\ndraft = true\n+++\n![lost](images/lost.png)',
  }])
  const beforeMissingImage = await currentDraftFingerprint(page)
  await page.getByLabel('导入 ZIP').setInputFiles({ name: 'missing-image.zip', mimeType: 'application/zip', buffer: missingImage })
  await expect(page.getByText('无法导入文章：缺少正文图片：images/lost.png')).toBeVisible()
  expect(await currentDraftFingerprint(page)).toEqual(beforeMissingImage)
})

test('retries a transient IndexedDB open failure and clears the page alert after a same-session autosave', async ({ page }) => {
  await page.addInitScript(() => {
    const native = window.indexedDB
    let firstOpen = true
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        open(...args: Parameters<IDBFactory['open']>) {
          if (firstOpen) {
            firstOpen = false
            throw new DOMException('transient test failure', 'InvalidStateError')
          }
          return native.open(...args)
        },
      },
    })
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('列出草稿失败')
  await page.getByRole('button', { name: '新建文章' }).click()
  await expect(page.getByRole('region', { name: '文章工作区' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Markdown 编辑器' }).fill('新的 IndexedDB 打开尝试必须允许同页自动保存。')
  await expect(page.getByRole('status')).toContainText('已保存到本地草稿')
  await expect(page.getByRole('alert')).toHaveCount(0)
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
  expect(await preview.locator('img[src^="blob:"]').evaluate((element) => ({
    complete: (element as HTMLImageElement).complete,
    width: (element as HTMLImageElement).naturalWidth,
    height: (element as HTMLImageElement).naturalHeight,
  }))).toEqual({ complete: true, width: 64, height: 36 })
})

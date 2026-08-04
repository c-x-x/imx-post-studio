import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { exportArticleBundle } from '../src/bundles/export-bundle'
import type { ArticleDraft } from '../src/metadata/article'

const outputPath = '/tmp/imx-post-studio-verification.zip'
const slug = 'imx-post-studio-verification'
const fixedTimestamp = Date.parse('2026-08-04T00:00:00.000Z')

class FixedDate extends Date {
  constructor(value?: string | number | Date) {
    super(value === undefined ? fixedTimestamp : value)
  }

  static now(): number {
    return fixedTimestamp
  }
}

const coverWebp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x22, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x20, 0x16, 0x00, 0x00, 0x00, 0xd0, 0x01, 0x00, 0x9d,
  0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x01, 0x40, 0x26, 0x25, 0xa4, 0x00,
  0x03, 0x70, 0x00, 0xfe, 0xfb, 0x94, 0x00, 0x00,
])

const bodyPng = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x28, 0xf5, 0x59, 0xf3,
  0x1f, 0x00, 0x05, 0x14, 0x02, 0x6d, 0x9d, 0xed, 0xf5, 0x48, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

const body = [
  '## 发布验证标题',
  '',
  '这篇文章由生产导出器生成，用于验证 Hugo leaf bundle 兼容性。',
  '',
  '### 表格验证',
  '',
  '| 检查项 | 结果 |',
  '| --- | --- |',
  '| 导出器 | 已验证 |',
  '| Hugo | 待构建 |',
  '',
  '> 这段引用用于验证 IMX 文章样式和 Hugo Markdown 渲染。',
  '',
  '- 列表项一',
  '- 列表项二',
  '',
  '```js',
  'const releaseBundle = "imx-post-studio-verification"',
  '```',
  '',
  '![验证正文图片](images/verification.png)',
].join('\n')

const draft: ArticleDraft = {
  id: 'imx-post-studio-verification',
  createdAt: '2026-08-04T00:00:00+08:00',
  updatedAt: '2026-08-04T00:00:00+08:00',
  meta: {
    title: 'IMX Post Studio 发布验证',
    slug,
    date: '2026-08-04T00:00:00+08:00',
    draft: false,
    categories: ['工程验证'],
    tags: ['IMX', 'Hugo'],
    description: '用于验证 IMX Post Studio 导出的 Hugo leaf bundle。',
    toc: true,
  },
  body,
  media: [
    {
      id: 'verification-cover',
      name: 'cover.webp',
      kind: 'cover',
      mime: 'image/webp',
      blob: new Blob([coverWebp], { type: 'image/webp' }),
      width: 1,
      height: 1,
    },
    {
      id: 'verification-body',
      name: 'verification.png',
      kind: 'body',
      mime: 'image/png',
      blob: new Blob([bodyPng], { type: 'image/png' }),
      width: 1,
      height: 1,
    },
  ],
}

const nativeDate = globalThis.Date
const nativeTimeZone = process.env.TZ
let bundle: Blob
try {
  globalThis.Date = FixedDate
  process.env.TZ = 'UTC'
  bundle = await exportArticleBundle(draft, { production: true, publish: true })
} finally {
  globalThis.Date = nativeDate
  if (nativeTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = nativeTimeZone
}
const bytes = new Uint8Array(await bundle.arrayBuffer())
await writeFile(outputPath, bytes)

console.log(JSON.stringify({
  outputPath,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
}, null, 2))

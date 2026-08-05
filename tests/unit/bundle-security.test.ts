import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { importArticleBundle, importLooseArticle } from '../../src/bundles/import-bundle'

async function archive(entries: Array<{ name: string; contents?: string | Uint8Array; directory?: boolean }>): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  try {
    for (const entry of entries) {
      if (entry.directory) {
        await writer.add(entry.name, undefined, { directory: true, level: 0 })
        continue
      }
      await writer.add(
        entry.name,
        typeof entry.contents === 'string' || entry.contents === undefined
          ? new TextReader(entry.contents ?? '')
          : new BlobReader(new Blob([new Uint8Array(entry.contents).buffer])),
        { level: 0 },
      )
    }
    return await writer.close()
  } finally {
    await writer.close().catch(() => undefined)
  }
}

async function corruptPayload(bundle: Blob, payload: Uint8Array): Promise<Blob> {
  const bytes = new Uint8Array(await bundle.arrayBuffer())
  const firstMatch = bytes.findIndex((_, start) => payload.every((value, index) => bytes[start + index] === value))
  if (firstMatch < 0) throw new Error('test archive did not contain the requested stored payload')
  bytes[firstMatch + payload.length - 1] ^= 0xff
  return new Blob([bytes], { type: 'application/zip' })
}

const validIndex = [
  '+++',
  'title = "Safe article"',
  'date = "2026-08-04T09:00:00+08:00"',
  'draft = true',
  '+++',
  'body',
].join('\n')

describe('bundle import security', () => {
  it('imports a macOS-created bundle with directory entries and metadata files', async () => {
    const imported = await importArticleBundle(await archive([
      { name: 'post/', directory: true },
      { name: '__MACOSX/', directory: true },
      { name: '__MACOSX/._post', contents: 'finder metadata' },
      { name: 'post/images/', directory: true },
      { name: '__MACOSX/post/', directory: true },
      { name: '__MACOSX/post/._index.md', contents: 'resource fork' },
      { name: 'post/.DS_Store', contents: 'finder metadata' },
      { name: 'post/index.md', contents: validIndex },
    ]))

    expect(imported.meta.slug).toBe('post')
    expect(imported.meta.title).toBe('Safe article')
  })

  it.each([
    '../escape.md',
    '/absolute/index.md',
    'post/../../escape.md',
  ])('rejects zip-slip entry %s before returning a draft', async (name) => {
    await expect(importArticleBundle(await archive([
      { name: 'post/index.md', contents: validIndex },
      { name, contents: 'hostile' },
    ]))).rejects.toThrow()
  })

  it('rejects unsupported and nested archive entries', async () => {
    await expect(importArticleBundle(await archive([
      { name: 'post/index.md', contents: validIndex },
      { name: 'post/images/nested/diagram.png', contents: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    ]))).rejects.toThrow()

    await expect(importArticleBundle(await archive([
      { name: 'post/index.md', contents: validIndex },
      { name: 'post/readme.txt', contents: 'unexpected' },
    ]))).rejects.toThrow()
  })

  it('rejects a cover front-matter path whose slug disagrees with the root directory', async () => {
    const mismatchedIndex = validIndex.replace(
      'draft = true',
      'draft = true\nimage = "/posts/other/images/cover.webp"',
    )
    await expect(importArticleBundle(await archive([
      { name: 'post/index.md', contents: mismatchedIndex },
      { name: 'post/images/cover.webp', contents: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]) },
    ]))).rejects.toThrow()
  })

  it('rejects a claimed image MIME type when its bytes are not a supported image', async () => {
    await expect(importLooseArticle(
      new File([validIndex], 'index.md', { type: 'text/markdown' }),
      [new File(['not an image'], 'diagram.png', { type: 'image/png' })],
    )).rejects.toThrow()
  })

  it('rejects a titleless ZIP instead of returning a draft that cannot export', async () => {
    const titleless = validIndex.replace('title = "Safe article"\n', '')
    await expect(importArticleBundle(await archive([
      { name: 'post/index.md', contents: titleless },
    ]))).rejects.toThrow('标题不能为空')
  })

  it('rejects a titleless loose article instead of returning a draft that cannot export', async () => {
    const titleless = validIndex.replace('title = "Safe article"\n', 'slug = "post"\n')
    await expect(importLooseArticle(
      new File([titleless], 'index.md', { type: 'text/markdown' }),
      [],
    )).rejects.toThrow('标题不能为空')
  })

  it('rejects an index whose same-size stored payload no longer matches its ZIP CRC', async () => {
    const source = await archive([{ name: 'post/index.md', contents: validIndex }])
    await expect(importArticleBundle(await corruptPayload(source, new TextEncoder().encode(validIndex))))
      .rejects.toThrow()
  })

  it('rejects an image whose same-size stored payload no longer matches its ZIP CRC', async () => {
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const source = await archive([
      { name: 'post/index.md', contents: validIndex },
      { name: 'post/images/diagram.png', contents: image },
    ])
    await expect(importArticleBundle(await corruptPayload(source, image))).rejects.toThrow()
  })
})

import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { importArticleBundle, importLooseArticle } from '../../src/bundles/import-bundle'

async function archive(entries: Array<{ name: string; contents?: string | Uint8Array }>): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  try {
    for (const entry of entries) {
      await writer.add(
        entry.name,
        typeof entry.contents === 'string' || entry.contents === undefined
          ? new TextReader(entry.contents ?? '')
          : new BlobReader(new Blob([new Uint8Array(entry.contents).buffer])),
      )
    }
    return await writer.close()
  } finally {
    await writer.close().catch(() => undefined)
  }
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
})

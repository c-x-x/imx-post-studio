import { describe, expect, it } from 'vitest'
import { exportArticleBundle } from '../../src/bundles/export-bundle'
import { importArticleBundle, importLooseArticle } from '../../src/bundles/import-bundle'
import type { ArticleDraft } from '../../src/metadata/article'

const coverBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
])
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

function draft(): ArticleDraft {
  return {
    id: 'draft-1',
    createdAt: '2026-08-04T09:00:00+08:00',
    updatedAt: '2026-08-04T09:00:00+08:00',
    meta: {
      title: 'IMX bundle test',
      slug: 'imx-test',
      date: '2026-08-04T09:00:00+08:00',
      draft: true,
      categories: ['技术'],
      tags: ['IMX'],
      description: 'round trip',
      toc: true,
    },
    body: '![图](images/diagram.png)\n',
    media: [
      {
        id: 'cover',
        name: 'cover.webp',
        kind: 'cover',
        mime: 'image/webp',
        blob: new Blob([coverBytes], { type: 'image/webp' }),
      },
      {
        id: 'diagram',
        name: 'diagram.png',
        kind: 'body',
        mime: 'image/png',
        blob: new Blob([pngBytes], { type: 'image/png' }),
      },
    ],
  }
}

describe('Hugo article bundle', () => {
  it('exports then transactionally imports a production bundle without mutating the draft', async () => {
    const source = draft()
    const zip = await exportArticleBundle(source, { production: true, publish: true })
    const imported = await importArticleBundle(zip)

    expect(imported.meta.slug).toBe('imx-test')
    expect(imported.meta.draft).toBe(false)
    expect(imported.body).toContain('images/diagram.png')
    expect(new Uint8Array(await imported.media[1].blob.arrayBuffer())).toEqual(pngBytes)
    expect(source.meta.draft).toBe(true)
  })

  it('imports a separately selected index and images only after all image bytes validate', async () => {
    const source = draft()
    const article = new File([
      '+++\n'
      + 'title = "IMX bundle test"\n'
      + 'date = "2026-08-04T09:00:00+08:00"\n'
      + 'draft = true\n'
      + 'image = "/posts/imx-test/images/cover.webp"\n'
      + '+++\n'
      + '![图](images/diagram.png)\n',
    ], 'index.md', { type: 'text/markdown' })
    const images = [
      new File([coverBytes], 'cover.webp', { type: 'image/webp' }),
      new File([pngBytes], 'diagram.png', { type: 'image/png' }),
    ]

    const imported = await importLooseArticle(article, images)

    expect(imported.meta.slug).toBe(source.meta.slug)
    expect(imported.media.map((asset) => [asset.name, asset.kind])).toEqual([
      ['cover.webp', 'cover'],
      ['diagram.png', 'body'],
    ])
  })
})

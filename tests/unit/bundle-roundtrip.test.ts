import { describe, expect, it } from 'vitest'
import { exportArticleBundle } from '../../src/bundles/export-bundle'
import { importArticleBundle, importLooseArticle } from '../../src/bundles/import-bundle'
import type { ArticleDraft } from '../../src/metadata/article'
import { serializeArticle } from '../../src/metadata/frontmatter'
import { createPngBuffer, tinyWebpBytes } from '../helpers/test-images'

const coverBytes = tinyWebpBytes
const pngBytes = new Uint8Array(createPngBuffer(1, 1))

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
  it('can independently reimport an exported article without a cover', async () => {
    const original = { ...draft(), media: [], body: 'No cover needed' }
    const imported = await importLooseArticle(new File([serializeArticle(original)], 'index.md'), [])
    expect(imported.meta.slug).toBe(original.meta.slug)
    expect(imported.body).toBe(original.body)
  })
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

  it.each([
    ['a body asset using the reserved cover.webp name', {
      id: 'bad-cover-role',
      name: 'cover.webp',
      kind: 'body' as const,
      mime: 'image/webp' as const,
      blob: new Blob([coverBytes], { type: 'image/webp' }),
    }],
    ['a cover asset with a non-cover filename', {
      id: 'bad-cover-name',
      name: 'hero.webp',
      kind: 'cover' as const,
      mime: 'image/webp' as const,
      blob: new Blob([coverBytes], { type: 'image/webp' }),
    }],
    ['a PNG whose Blob bytes are spoofed', {
      id: 'spoofed-bytes',
      name: 'diagram.png',
      kind: 'body' as const,
      mime: 'image/png' as const,
      blob: new Blob(['not an image'], { type: 'image/png' }),
    }],
    ['a PNG whose Blob MIME and signature disagree', {
      id: 'mismatched-mime',
      name: 'diagram.png',
      kind: 'body' as const,
      mime: 'image/png' as const,
      blob: new Blob([coverBytes], { type: 'image/webp' }),
    }],
  ])('rejects export before creating a writer for %s', async (_reason, invalidAsset) => {
    const source = draft()
    const replacementName = invalidAsset.kind === 'cover' ? 'cover.webp' : invalidAsset.name
    const media = [
      ...source.media.filter((asset) => asset.name !== replacementName),
      invalidAsset,
    ]

    await expect(exportArticleBundle({ ...source, media }, { production: true, publish: true })).rejects.toThrow()
  })
})

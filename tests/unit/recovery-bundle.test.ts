import { describe, expect, it } from 'vitest'
import { exportRecoveryBundle, importRecoveryBundle } from '../../src/bundles/recovery-bundle'
import type { ArticleDraft } from '../../src/metadata/article'

function incompleteDraft(): ArticleDraft {
  return {
    id: 'incomplete', createdAt: '2026-08-04T09:00:00+08:00', updatedAt: '2026-08-04T09:01:00+08:00',
    meta: { title: '', slug: 'Invalid slug', date: 'not-a-date', draft: false, categories: ['技术'], tags: ['草稿'], description: '', toc: true },
    body: '![missing](images/missing.png)\n原始正文',
    media: [{ id: 'raw', name: 'raw.bin', kind: 'body', mime: 'image/png', blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/octet-stream' }) }],
  }
}

describe('emergency recovery bundle', () => {
  it('round-trips an invalid, incomplete draft without normal article export validation', async () => {
    const source = incompleteDraft()
    const archive = await exportRecoveryBundle(source)
    const recovered = await importRecoveryBundle(archive)

    expect(recovered.id).toBe(source.id)
    expect(recovered.meta).toEqual(source.meta)
    expect(recovered.body).toBe(source.body)
    expect(new Uint8Array(await recovered.media[0].blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))
  })
})

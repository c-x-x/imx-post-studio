import { describe, expect, it } from 'vitest'
import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { exportRecoveryBundle, importRecoveryBundle } from '../../src/bundles/recovery-bundle'
import type { ArticleDraft } from '../../src/metadata/article'
import { MAX_ARCHIVE_FILE_BYTES } from '../../src/shared/limits'

function incompleteDraft(): ArticleDraft {
  return {
    id: 'incomplete', createdAt: '2026-08-04T09:00:00+08:00', updatedAt: '2026-08-04T09:01:00+08:00',
    meta: { title: '', slug: 'Invalid slug', date: 'not-a-date', draft: false, categories: ['技术'], tags: ['草稿'], description: '', toc: true },
    body: '![missing](images/missing.png)\n原始正文',
    media: [{ id: 'raw', name: 'raw.bin', kind: 'body', mime: 'image/png', blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/octet-stream' }) }],
  }
}

function emptyRecoveryPayload() {
  return {
    format: 'imx-post-studio-recovery-v1',
    draft: {
      id: 'recovery', createdAt: '2026-08-04T09:00:00+08:00', updatedAt: '2026-08-04T09:00:00+08:00',
      meta: { title: '', slug: '', date: 'not-a-date', draft: true, categories: [], tags: [], description: '', toc: true },
      body: '',
    },
    media: [],
  }
}

async function archiveWith(entries: Array<{ name: string; data: string | Blob }>): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  for (const entry of entries) {
    await writer.add(entry.name, typeof entry.data === 'string' ? new TextReader(entry.data) : new BlobReader(entry.data))
  }
  return writer.close()
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

  it('rejects hostile paths, extra files, malformed manifests, oversized entries, and corrupt ZIP data before restoration', async () => {
    const valid = JSON.stringify(emptyRecoveryPayload())
    await expect(importRecoveryBundle(await archiveWith([{ name: 'recovery.json', data: valid }, { name: '../escape', data: 'x' }]))).rejects.toThrow('无法恢复紧急备份')
    await expect(importRecoveryBundle(await archiveWith([{ name: 'recovery.json', data: valid }, { name: 'extra.txt', data: 'x' }]))).rejects.toThrow('无法恢复紧急备份')
    await expect(importRecoveryBundle(await archiveWith([{ name: 'recovery.json', data: '{"format":"imx-post-studio-recovery-v1"}' }]))).rejects.toThrow('无法恢复紧急备份')
    await expect(importRecoveryBundle(await archiveWith([{ name: 'recovery.json', data: new Blob([new Uint8Array(MAX_ARCHIVE_FILE_BYTES + 1)]) }]))).rejects.toThrow('无法恢复紧急备份')
    await expect(importRecoveryBundle(new Blob(['not a ZIP']))).rejects.toThrow('无法恢复紧急备份')
  })
})

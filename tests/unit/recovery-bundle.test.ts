import { describe, expect, it } from 'vitest'
import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { assertRecoveryBundleExportable, exportRecoveryBundle, importRecoveryBundle } from '../../src/bundles/recovery-bundle'
import type { ArticleDraft, MediaAsset } from '../../src/metadata/article'
import { MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_FILE_BYTES, MAX_ARCHIVE_TOTAL_BYTES } from '../../src/shared/limits'
import { fileFromBlob } from '../helpers/test-files'

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

function mediaAsset(index: number, blob = new Blob()): MediaAsset {
  return { id: `asset-${index}`, name: `asset-${index}.png`, kind: 'body', mime: 'image/png', blob }
}

function draftWithMedia(media: MediaAsset[], body = ''): ArticleDraft {
  return { ...incompleteDraft(), body, media }
}

function blobReportingSize(size: number): Blob {
  const blob = new Blob()
  Object.defineProperty(blob, 'size', { value: size })
  return blob
}

describe('emergency recovery bundle', () => {
  it('imports an exported recovery ZIP after a browser File input wraps it', async () => {
    const archive = await exportRecoveryBundle(incompleteDraft())
    const file = await fileFromBlob(archive, 'recovery.zip')
    const archiveBytes = new Uint8Array(await archive.arrayBuffer())
    const fileBytes = new Uint8Array(await file.arrayBuffer())

    expect(file.type).toBe(archive.type)
    expect(fileBytes).toEqual(archiveBytes)
    expect(fileBytes.slice(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))
    await expect(importRecoveryBundle(file)).resolves.toMatchObject({ id: 'incomplete' })
  })

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

  it('permits 499 media entries but rejects the 500-media ZIP that import cannot accept', async () => {
    const importable = draftWithMedia(Array.from({ length: MAX_ARCHIVE_ENTRIES - 1 }, (_value, index) => mediaAsset(index)))
    expect(() => assertRecoveryBundleExportable(importable)).not.toThrow()
    expect((await importRecoveryBundle(await exportRecoveryBundle(importable))).media).toHaveLength(MAX_ARCHIVE_ENTRIES - 1)

    const tooMany = draftWithMedia(Array.from({ length: MAX_ARCHIVE_ENTRIES }, (_value, index) => mediaAsset(index)))
    expect(() => assertRecoveryBundleExportable(tooMany)).toThrow('条目数')
    await expect(exportRecoveryBundle(tooMany)).rejects.toThrow('条目数')
  })

  it('preflights manifest, media, and exact aggregate recovery limits before ZIP writing', async () => {
    expect(() => assertRecoveryBundleExportable(draftWithMedia([], 'x'.repeat(MAX_ARCHIVE_FILE_BYTES + 1)))).toThrow('recovery.json')
    expect(() => assertRecoveryBundleExportable(draftWithMedia([mediaAsset(0, blobReportingSize(MAX_ARCHIVE_FILE_BYTES + 1))]))).toThrow('media/0')

    const prefix = Array.from({ length: 9 }, (_value, index) => mediaAsset(index, blobReportingSize(MAX_ARCHIVE_FILE_BYTES)))
    let low = 0
    let high = MAX_ARCHIVE_FILE_BYTES
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      try {
        assertRecoveryBundleExportable(draftWithMedia([...prefix, mediaAsset(9, blobReportingSize(middle))]))
        low = middle
      } catch {
        high = middle - 1
      }
    }
    expect(() => assertRecoveryBundleExportable(draftWithMedia([...prefix, mediaAsset(9, blobReportingSize(low))]))).not.toThrow()
    expect(() => assertRecoveryBundleExportable(draftWithMedia([...prefix, mediaAsset(9, blobReportingSize(low + 1))]))).toThrow('总大小')
    expect(low).toBeLessThan(MAX_ARCHIVE_TOTAL_BYTES - 9 * MAX_ARCHIVE_FILE_BYTES)
  })
})

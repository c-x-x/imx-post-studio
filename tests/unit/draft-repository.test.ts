import 'fake-indexeddb/auto'

import { beforeAll, describe, expect, it } from 'vitest'
import { draftRepository } from '../../src/drafts/repository'
import type { ArticleDraft } from '../../src/metadata/article'

const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const NativeBlob = Function('return process.getBuiltinModule("buffer").Blob')() as typeof Blob

function draft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    id: 'draft-1',
    createdAt: '2026-08-04T09:00:00+08:00',
    updatedAt: '2026-08-04T09:00:00+08:00',
    meta: {
      title: 'First draft',
      slug: 'first-draft',
      date: '2026-08-04T09:00:00+08:00',
      draft: true,
      categories: ['技术'],
      tags: ['IMX'],
      description: 'A saved draft',
      toc: true,
    },
    body: 'Hello, IMX',
    media: [{
      id: 'image-1',
      name: 'diagram.png',
      kind: 'body',
      mime: 'image/png',
      blob: new NativeBlob([imageBytes], { type: 'image/png' }),
    }],
    ...overrides,
  }
}

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('imx-post-studio')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('测试数据库仍被占用'))
  })
})

describe('draftRepository', () => {
  it('creates and replaces a draft without leaking mutable values or Blob bytes', async () => {
    const original = draft()
    await draftRepository.put(original)
    original.meta.title = 'Changed outside storage'
    original.media.push({
      id: 'outside', name: 'outside.png', kind: 'body', mime: 'image/png',
      blob: new NativeBlob(['outside'], { type: 'image/png' }),
    })

    const stored = await draftRepository.get('draft-1')
    expect(stored?.meta.title).toBe('First draft')
    expect(stored?.media).toHaveLength(1)
    expect(stored?.media[0].blob.type).toBe('image/png')
    expect(new Uint8Array(await stored!.media[0].blob.arrayBuffer())).toEqual(imageBytes)

    stored!.meta.title = 'Changed after reading'
    expect((await draftRepository.get('draft-1'))?.meta.title).toBe('First draft')

    await draftRepository.put(draft({
      body: 'Replacement body',
      updatedAt: '2026-08-04T10:00:00+08:00',
    }))
    expect((await draftRepository.get('draft-1'))?.body).toBe('Replacement body')
  })

  it('lists drafts newest first with ID descending as a deterministic time tie-break', async () => {
    await draftRepository.put(draft({
      id: 'same-time-a',
      updatedAt: '2026-08-04T11:00:00+08:00',
    }))
    await draftRepository.put(draft({
      id: 'same-time-b',
      updatedAt: '2026-08-04T11:00:00+08:00',
    }))

    expect((await draftRepository.list()).map((item) => item.id).slice(0, 2)).toEqual([
      'same-time-b',
      'same-time-a',
    ])
  })

  it('duplicates a draft with a new ID and fresh timestamps while preserving image bytes', async () => {
    await draftRepository.put(draft({ id: 'duplicate-source' }))

    const copy = await draftRepository.duplicate('duplicate-source')

    expect(copy.id).not.toBe('duplicate-source')
    expect(copy.createdAt).not.toBe('2026-08-04T09:00:00+08:00')
    expect(copy.updatedAt).toBe(copy.createdAt)
    expect(copy.media[0].blob.type).toBe('image/png')
    expect(new Uint8Array(await copy.media[0].blob.arrayBuffer())).toEqual(imageBytes)
    expect((await draftRepository.get('duplicate-source'))?.id).toBe('duplicate-source')
  })

  it('renames with a trimmed required title and updates the modified timestamp', async () => {
    await draftRepository.put(draft({ id: 'rename-me' }))

    const renamed = await draftRepository.rename('rename-me', '  Renamed draft  ')

    expect(renamed.meta.title).toBe('Renamed draft')
    expect(renamed.updatedAt).not.toBe('2026-08-04T09:00:00+08:00')
    await expect(draftRepository.rename('rename-me', '   ')).rejects.toThrow('标题不能为空')
  })

  it('deletes an existing draft and explains an attempt to duplicate an absent one', async () => {
    await draftRepository.put(draft({ id: 'delete-me' }))
    await draftRepository.delete('delete-me')

    expect(await draftRepository.get('delete-me')).toBeUndefined()
    await expect(draftRepository.duplicate('missing-draft')).rejects.toThrow('草稿不存在')
  })
})

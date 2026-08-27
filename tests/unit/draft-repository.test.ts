import 'fake-indexeddb/auto'

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getDraftDatabase } from '../../src/drafts/database'
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
  it('actually deletes a pushed draft and prevents delayed writes from resurrecting it', async () => {
    const pushed = draft({ id: 'published-draft' })
    await draftRepository.put(pushed)
    await draftRepository.completePush(pushed.id, 'a'.repeat(40))
    expect(await draftRepository.get(pushed.id)).toBeUndefined()
    expect(await (await getDraftDatabase()).get('published', pushed.id)).toBe('a'.repeat(40))
    await expect(draftRepository.put(pushed)).rejects.toThrow(/已推送/)
    expect(await draftRepository.get(pushed.id)).toBeUndefined()
  })
  it('snapshots a fresh database put before its first await', async () => {
    const original = draft({ id: 'snapshot-before-open' })
    const saving = draftRepository.put(original)
    original.body = 'mutated before IndexedDB opens'
    original.meta.title = 'Mutated before IndexedDB opens'

    await saving
    const stored = await draftRepository.get('snapshot-before-open')
    expect(stored?.body).toBe('Hello, IMX')
    expect(stored?.meta.title).toBe('First draft')
  })

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

  it('rejects a Blob whose MIME conflicts with media metadata before it reaches IndexedDB', async () => {
    await expect(draftRepository.put(draft({
      id: 'blob-type-is-source-of-truth',
      media: [{
        id: 'mismatched-type',
        name: 'diagram.png',
        kind: 'body',
        mime: 'image/png',
        blob: new NativeBlob([imageBytes], { type: 'image/jpeg' }),
      }],
    }))).rejects.toThrow('保存草稿失败：草稿记录损坏：媒体 MIME 与 blobType 不一致：diagram.png')
  })

  it.each([
    ['non-ArrayBuffer bytes', {
      id: 'corrupt-bytes', name: 'diagram.png', kind: 'body', mime: 'image/png', blobType: 'image/png', blob: new Uint8Array(imageBytes),
    }, '媒体二进制不是 ArrayBuffer：diagram.png'],
    ['mismatched record MIME', {
      id: 'corrupt-mime', name: 'diagram.png', kind: 'body', mime: 'image/png', blobType: 'image/jpeg', blob: imageBytes.buffer.slice(0),
    }, '媒体 MIME 与 blobType 不一致：diagram.png'],
    ['unsafe media name', {
      id: 'corrupt-name', name: '../escape.png', kind: 'body', mime: 'image/png', blobType: 'image/png', blob: imageBytes.buffer.slice(0),
    }, '媒体名称无效：../escape.png'],
    ['empty media ID', {
      id: '', name: 'diagram.png', kind: 'body', mime: 'image/png', blobType: 'image/png', blob: imageBytes.buffer.slice(0),
    }, '媒体标识无效：diagram.png'],
  ])('rejects a corrupt %s persisted record with an actionable error', async (_label, media, message) => {
    const database = await getDraftDatabase()
    const id = `corrupt-${media.id || 'id'}`
    await database.put('drafts', { ...draft({ id }), media: [media] } as never)

    await expect(draftRepository.get(id)).rejects.toThrow(`读取草稿失败：草稿记录损坏：${message}`)
    await database.delete('drafts', id)
  })

  it('persists media as byte buffers and hydrates legacy Blob records', async () => {
    await draftRepository.put(draft({ id: 'webkit-buffer-storage' }))
    const database = await getDraftDatabase()
    const stored = await database.get('drafts', 'webkit-buffer-storage')
    expect(Object.prototype.toString.call(stored?.media[0].blob)).toBe('[object ArrayBuffer]')
    expect(stored?.media[0].blobType).toBe('image/png')

    await database.put('drafts', draft({ id: 'legacy-blob-storage' }) as never)
    const legacy = await draftRepository.get('legacy-blob-storage')
    expect(legacy?.media[0].blob.type).toBe('image/png')
    expect(new Uint8Array(await legacy!.media[0].blob.arrayBuffer())).toEqual(imageBytes)
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

  it('does not expose historical empty records in the draft library', async () => {
    await draftRepository.put(draft({
      id: 'historical-empty',
      body: '   ',
      media: [],
      meta: {
        title: '',
        slug: '',
        date: '2026-08-04T09:00:00+08:00',
        draft: true,
        categories: [],
        tags: [],
        description: '',
        toc: true,
      },
    }))

    expect((await draftRepository.list()).map((item) => item.id)).not.toContain('historical-empty')
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
    await expect(draftRepository.rename('missing-rename', 'Renamed')).rejects.toThrow('草稿不存在')
  })

  it('renames in one completed readwrite transaction so a concurrent autosave cannot be overwritten', async () => {
    const done = deferred<void>()
    const store = {
      get: vi.fn().mockResolvedValue(draft({ id: 'rename-transaction' })),
      put: vi.fn().mockResolvedValue(undefined),
    }
    const transaction = { store, done: done.promise }
    const database = { transaction: vi.fn().mockReturnValue(transaction) }
    const databaseModule = await import('../../src/drafts/database')
    const getDatabase = vi.spyOn(databaseModule, 'getDraftDatabase').mockResolvedValue(database as never)

    try {
      const renaming = draftRepository.rename('rename-transaction', 'Atomic rename')
      await Promise.resolve()
      await Promise.resolve()
      expect(database.transaction).toHaveBeenCalledWith('drafts', 'readwrite')
      expect(store.get).toHaveBeenCalledWith('rename-transaction')
      expect(store.put).toHaveBeenCalledWith(expect.objectContaining({
        body: 'Hello, IMX',
        meta: expect.objectContaining({ title: 'Atomic rename' }),
      }))

      let completed = false
      void renaming.then(() => { completed = true })
      await Promise.resolve()
      expect(completed).toBe(false)

      done.resolve()
      expect((await renaming).meta.title).toBe('Atomic rename')
    } finally {
      getDatabase.mockRestore()
    }
  })

  it('deletes existing drafts, treats missing deletes as idempotent, and explains missing duplicates', async () => {
    await draftRepository.put(draft({ id: 'delete-me' }))
    await draftRepository.delete('delete-me')

    expect(await draftRepository.get('delete-me')).toBeUndefined()
    await expect(draftRepository.delete('already-missing')).resolves.toBeUndefined()
    await expect(draftRepository.duplicate('missing-draft')).rejects.toThrow('草稿不存在')
  })

  it('keeps a later delete final when an earlier draft write is still serializing media', async () => {
    const bytes = deferred<ArrayBuffer>()
    const delayedBlob = new NativeBlob([imageBytes], { type: 'image/png' })
    vi.spyOn(delayedBlob, 'arrayBuffer').mockReturnValue(bytes.promise)
    const current = draft({
      id: 'delete-after-pending-put',
      media: [{ ...draft().media[0], blob: delayedBlob }],
    })

    const saving = draftRepository.put(current)
    const deleting = draftRepository.delete(current.id)
    let deleteCompleted = false
    void deleting.then(() => { deleteCompleted = true })
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(deleteCompleted).toBe(false)

    bytes.resolve(new Uint8Array(imageBytes).buffer)
    await Promise.all([saving, deleting])
    expect(await draftRepository.get(current.id)).toBeUndefined()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

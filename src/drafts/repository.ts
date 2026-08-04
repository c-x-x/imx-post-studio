import type { ArticleDraft, MediaAsset } from '../metadata/article'
import { getDraftDatabase, type StoredArticleDraft, type StoredMediaAsset } from './database'

interface MediaSnapshot extends Omit<MediaAsset, 'blob'> {
  blob: Blob
  blobType: string
}

interface DraftSnapshot extends Omit<ArticleDraft, 'media'> {
  media: MediaSnapshot[]
}

function snapshotDraft(draft: ArticleDraft): DraftSnapshot {
  return {
    ...draft,
    meta: {
      ...draft.meta,
      categories: [...draft.meta.categories],
      tags: [...draft.meta.tags],
    },
    media: draft.media.map((asset) => ({
      ...asset,
      blobType: asset.blob.type,
    })),
  }
}

async function serializeDraft(draft: ArticleDraft): Promise<StoredArticleDraft> {
  const snapshot = snapshotDraft(draft)
  return {
    ...snapshot,
    media: await Promise.all(snapshot.media.map(async (asset) => ({
      ...asset,
      blob: await asset.blob.arrayBuffer(),
    }))),
  }
}

function isLegacyBlob(value: ArrayBuffer | Blob): value is Blob {
  // IndexedDB and tests can cross realms, where `instanceof Blob` is not
  // reliable even though the historical record still exposes Blob's API.
  return typeof (value as Blob).arrayBuffer === 'function'
}

async function hydrateAsset(asset: StoredMediaAsset): Promise<MediaAsset> {
  const blob = isLegacyBlob(asset.blob)
    ? new Blob([await asset.blob.arrayBuffer()], { type: asset.blob.type })
    : new Blob([asset.blob.slice(0)], { type: asset.blobType || asset.mime })
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
    blob,
  }
}

async function hydrateDraft(draft: StoredArticleDraft): Promise<ArticleDraft> {
  return {
    ...draft,
    meta: {
      ...draft.meta,
      categories: [...draft.meta.categories],
      tags: [...draft.meta.tags],
    },
    media: await Promise.all(draft.media.map(hydrateAsset)),
  }
}

function storageError(action: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : '浏览器本地存储不可用'
  return new Error(`${action}失败：${detail}`)
}

function currentTimestamp(): string {
  return new Date().toISOString()
}

async function readDraft(id: string): Promise<ArticleDraft | undefined> {
  try {
    const database = await getDraftDatabase()
    const draft = await database.get('drafts', id)
    return draft === undefined ? undefined : await hydrateDraft(draft)
  } catch (error) {
    throw storageError('读取草稿', error)
  }
}

async function saveDraft(draft: ArticleDraft): Promise<void> {
  // Take every mutable value before opening IndexedDB. Blob contents are
  // immutable, so retaining the Blob long enough to copy its bytes is safe.
  const storedDraft = serializeDraft(draft)
  try {
    const database = await getDraftDatabase()
    await database.put('drafts', await storedDraft)
  } catch (error) {
    throw storageError('保存草稿', error)
  }
}

export const draftRepository = {
  async get(id: string): Promise<ArticleDraft | undefined> {
    return readDraft(id)
  },

  async list(): Promise<ArticleDraft[]> {
    try {
      const database = await getDraftDatabase()
      const drafts = await database.getAllFromIndex('drafts', 'updatedAt')
      return await Promise.all(
        drafts
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
          .map(hydrateDraft),
      )
    } catch (error) {
      throw storageError('列出草稿', error)
    }
  },

  async put(draft: ArticleDraft): Promise<void> {
    await saveDraft(draft)
  },

  async duplicate(id: string): Promise<ArticleDraft> {
    const source = await readDraft(id)
    if (!source) throw new Error('草稿不存在，无法复制')

    const timestamp = currentTimestamp()
    const duplicate: ArticleDraft = {
      ...source,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      meta: { ...source.meta, categories: [...source.meta.categories], tags: [...source.meta.tags] },
      media: source.media.map((asset) => ({ ...asset })),
    }
    await saveDraft(duplicate)
    return hydrateDraft(await serializeDraft(duplicate))
  },

  async rename(id: string, title: string): Promise<ArticleDraft> {
    const nextTitle = title.trim()
    if (!nextTitle) throw new Error('标题不能为空，无法重命名草稿')

    try {
      const database = await getDraftDatabase()
      const transaction = database.transaction('drafts', 'readwrite')
      const source = await transaction.store.get(id)
      if (!source) throw new Error('草稿不存在，无法重命名')

      const renamed: StoredArticleDraft = {
        ...source,
        updatedAt: currentTimestamp(),
        meta: { ...source.meta, title: nextTitle },
        media: source.media.map((asset) => ({ ...asset })),
      }
      await transaction.store.put(renamed)
      await transaction.done
      return hydrateDraft(renamed)
    } catch (error) {
      throw storageError('重命名草稿', error)
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const database = await getDraftDatabase()
      await database.delete('drafts', id)
    } catch (error) {
      throw storageError('删除草稿', error)
    }
  },
}

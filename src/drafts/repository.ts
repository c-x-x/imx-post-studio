import { hasDraftContent, type ArticleDraft, type MediaAsset, type MediaKind, type MediaMime } from '../metadata/article'
import { assertSafeImageName } from '../bundles/media-validation'
import { getDraftDatabase, type StoredArticleDraft, type StoredMediaAsset } from './database'

const MEDIA_MIMES = new Set<MediaMime>(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MEDIA_KINDS = new Set<MediaKind>(['cover', 'body'])
const draftMutations = new Map<string, Promise<void>>()

interface MediaSnapshot extends Omit<MediaAsset, 'blob'> {
  blob: Blob
  blobType: string
}

interface DraftSnapshot extends Omit<ArticleDraft, 'media'> {
  media: MediaSnapshot[]
}

type UnknownRecord = Record<string, unknown>

function corruptDraft(message: string): Error {
  return new Error(`草稿记录损坏：${message}`)
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isDimension(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]'
}

function isLegacyBlob(value: unknown): value is Blob {
  return isRecord(value)
    && Object.prototype.toString.call(value) === '[object Blob]'
    && typeof value.arrayBuffer === 'function'
    && typeof value.type === 'string'
    && typeof value.size === 'number'
}

function assertStoredMeta(value: unknown): void {
  if (!isRecord(value)
    || typeof value.title !== 'string' || typeof value.slug !== 'string' || typeof value.date !== 'string'
    || typeof value.draft !== 'boolean' || !isStringArray(value.categories) || !isStringArray(value.tags)
    || typeof value.description !== 'string' || typeof value.toc !== 'boolean') {
    throw corruptDraft('元数据格式无效')
  }
}

function assertStoredMedia(asset: unknown, ids: Set<string>, names: Set<string>): asserts asset is StoredMediaAsset {
  if (!isRecord(asset) || typeof asset.id !== 'string' || !asset.id.trim()) {
    const name = isRecord(asset) && typeof asset.name === 'string' ? asset.name : '未知图片'
    throw corruptDraft(`媒体标识无效：${name}`)
  }
  if (typeof asset.name !== 'string') throw corruptDraft('媒体名称无效：未知图片')
  try {
    if (assertSafeImageName(asset.name) !== asset.mime) throw new Error('MIME mismatch')
  } catch {
    throw corruptDraft(`媒体名称无效：${asset.name}`)
  }
  if (typeof asset.mime !== 'string' || !MEDIA_MIMES.has(asset.mime as MediaMime)
    || typeof asset.kind !== 'string' || !MEDIA_KINDS.has(asset.kind as MediaKind)
    || !isDimension(asset.width) || !isDimension(asset.height)) {
    throw corruptDraft(`媒体格式无效：${asset.name}`)
  }
  if ((asset.kind === 'cover') !== (asset.name === 'cover.webp')) {
    throw corruptDraft(`封面媒体标识无效：${asset.name}`)
  }
  if (ids.has(asset.id) || names.has(asset.name)) throw corruptDraft(`媒体标识或名称重复：${asset.name}`)
  ids.add(asset.id)
  names.add(asset.name)

  const blobType = isLegacyBlob(asset.blob) ? asset.blob.type : asset.blobType
  if (typeof blobType !== 'string' || blobType !== asset.mime) {
    throw corruptDraft(`媒体 MIME 与 blobType 不一致：${asset.name}`)
  }
  if (isLegacyBlob(asset.blob)) return
  if (!isArrayBuffer(asset.blob)) throw corruptDraft(`媒体二进制不是 ArrayBuffer：${asset.name}`)
}

function assertStoredDraft(value: unknown): asserts value is StoredArticleDraft {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.createdAt !== 'string' || !value.createdAt || typeof value.updatedAt !== 'string' || !value.updatedAt
    || typeof value.body !== 'string' || !Array.isArray(value.media)) {
    throw corruptDraft('草稿结构无效')
  }
  assertStoredMeta(value.meta)
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const asset of value.media) assertStoredMedia(asset, ids, names)
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
  const stored: StoredArticleDraft = {
    ...snapshot,
    media: await Promise.all(snapshot.media.map(async (asset) => ({
      ...asset,
      blob: await asset.blob.arrayBuffer(),
    }))),
  }
  assertStoredDraft(stored)
  return stored
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
  assertStoredDraft(draft)
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

function enqueueDraftMutation<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const previous = draftMutations.get(id) ?? Promise.resolve()
  const running = previous.catch(() => undefined).then(operation)
  const settled = running.then(() => undefined, () => undefined)
  draftMutations.set(id, settled)
  void settled.then(() => {
    if (draftMutations.get(id) === settled) draftMutations.delete(id)
  })
  return running
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
  return enqueueDraftMutation(draft.id, async () => {
    try {
      const database = await getDraftDatabase()
      const snapshot = await storedDraft
      const tx = database.transaction(['drafts', 'published'], 'readwrite')
      if (await tx.objectStore('published').get(draft.id)) {
        await tx.done
        throw new Error('此草稿已推送，请从作品页重新读取；当前窗口的内容可先导出备份')
      }
      await tx.objectStore('drafts').put(snapshot)
      await tx.done
    } catch (error) {
      throw storageError('保存草稿', error)
    }
  })
}

export const draftRepository = {
  async completePush(id: string, commit: string): Promise<void> {
    return enqueueDraftMutation(id, async () => {
      const database = await getDraftDatabase()
      // The receipt and actual deletion are atomic, including across browser tabs.
      const tx = database.transaction(['drafts', 'published'], 'readwrite')
      await tx.objectStore('published').put(commit, id)
      await tx.objectStore('drafts').delete(id)
      await tx.done
    })
  },
  async get(id: string): Promise<ArticleDraft | undefined> {
    return readDraft(id)
  },

  async list(): Promise<ArticleDraft[]> {
    try {
      const database = await getDraftDatabase()
      const drafts = await database.getAllFromIndex('drafts', 'updatedAt')
      const hydrated = await Promise.all(
        drafts
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
          .map(hydrateDraft),
      )
      return hydrated.filter(hasDraftContent)
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
      assertStoredDraft(source)

      const renamed: StoredArticleDraft = {
        ...source,
        updatedAt: currentTimestamp(),
        meta: { ...source.meta, title: nextTitle },
        media: source.media.map((asset) => ({ ...asset })),
      }
      assertStoredDraft(renamed)
      await transaction.store.put(renamed)
      await transaction.done
      return hydrateDraft(renamed)
    } catch (error) {
      throw storageError('重命名草稿', error)
    }
  },

  async delete(id: string): Promise<void> {
    return enqueueDraftMutation(id, async () => {
      try {
        const database = await getDraftDatabase()
        await database.delete('drafts', id)
      } catch (error) {
        throw storageError('删除草稿', error)
      }
    })
  },
}

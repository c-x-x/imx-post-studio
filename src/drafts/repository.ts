import type { ArticleDraft } from '../metadata/article'
import { getDraftDatabase } from './database'

async function copyDraft(draft: ArticleDraft): Promise<ArticleDraft> {
  return {
    ...draft,
    meta: {
      ...draft.meta,
      categories: [...draft.meta.categories],
      tags: [...draft.meta.tags],
    },
    media: await Promise.all(draft.media.map(async (asset) => ({
      ...asset,
      blob: new Blob([await asset.blob.arrayBuffer()], { type: asset.mime }),
    }))),
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
    return draft === undefined ? undefined : await copyDraft(draft)
  } catch (error) {
    throw storageError('读取草稿', error)
  }
}

async function saveDraft(draft: ArticleDraft): Promise<void> {
  try {
    const database = await getDraftDatabase()
    await database.put('drafts', draft)
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
          .map(copyDraft),
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
    return copyDraft(duplicate)
  },

  async rename(id: string, title: string): Promise<ArticleDraft> {
    const nextTitle = title.trim()
    if (!nextTitle) throw new Error('标题不能为空，无法重命名草稿')

    const source = await readDraft(id)
    if (!source) throw new Error('草稿不存在，无法重命名')

    const renamed: ArticleDraft = {
      ...source,
      updatedAt: currentTimestamp(),
      meta: { ...source.meta, title: nextTitle },
    }
    await saveDraft(renamed)
    return copyDraft(renamed)
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

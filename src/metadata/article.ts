import { validateSlug } from './slug'

export type MediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
export type MediaKind = 'cover' | 'body'

export interface MediaAsset {
  id: string
  name: string
  kind: MediaKind
  mime: MediaMime
  blob: Blob
  width?: number
  height?: number
}

export interface ArticleMeta {
  title: string
  slug: string
  date: string
  draft: boolean
  categories: string[]
  tags: string[]
  description: string
  toc: boolean
}

export interface ArticleDraft {
  id: string
  createdAt: string
  updatedAt: string
  meta: ArticleMeta
  body: string
  media: MediaAsset[]
}

const CANONICAL_BEIJING_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+08:00$/

export function assertCompleteArticleMeta(meta: ArticleMeta): void {
  if (!meta.title.trim()) throw new Error('标题不能为空')
  if (!validateSlug(meta.slug).ok) throw new Error('Slug 只能包含小写英文、数字和单个连字符')
  if (!CANONICAL_BEIJING_DATE.test(meta.date)) {
    throw new Error('date 必须是规范的 +08:00 RFC 3339 日期时间')
  }
  if (!Array.isArray(meta.categories) || meta.categories.some((value) => typeof value !== 'string')) {
    throw new Error('categories 必须是字符串数组')
  }
  if (!Array.isArray(meta.tags) || meta.tags.some((value) => typeof value !== 'string')) {
    throw new Error('tags 必须是字符串数组')
  }
  if (typeof meta.draft !== 'boolean' || typeof meta.description !== 'string' || typeof meta.toc !== 'boolean') {
    throw new Error('文章元数据格式无效')
  }
}

function formatBeijingDateTime(now: Date): string {
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return `${beijingTime.toISOString().slice(0, 19)}+08:00`
}

export function createArticleDraft(now = new Date()): ArticleDraft {
  const timestamp = formatBeijingDateTime(now)

  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    meta: {
      title: '',
      slug: '',
      date: timestamp,
      draft: true,
      categories: [],
      tags: [],
      description: '',
      toc: true,
    },
    body: '',
    media: [],
  }
}

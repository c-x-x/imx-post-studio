import { validateSlug } from './slug.js'

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

export const UNTITLED_DRAFT_MESSAGE = '文章未命名，未保存至本地草稿'

export function hasDraftTitle(draft: ArticleDraft): boolean {
  return Boolean(draft.meta.title.trim())
}

export function hasDraftContent(draft: ArticleDraft): boolean {
  return Boolean(
    draft.body.trim()
    || draft.meta.title.trim()
    || draft.meta.slug.trim()
    || draft.meta.description.trim()
    || draft.meta.categories.some((value) => value.trim())
    || draft.meta.tags.some((value) => value.trim())
    || draft.media.length,
  )
}

const CANONICAL_BEIJING_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\+08:00$/

/**
 * Keep RFC 3339 shape and calendar validation together. Date.parse normalizes
 * invalid dates (for example February 30), which is not suitable for authoring
 * or export validation.
 */
export function validateCanonicalBeijingDate(value: string): string | undefined {
  const match = CANONICAL_BEIJING_DATE.exec(value)
  if (!match) return 'date 必须是规范的 +08:00 RFC 3339 日期时间'

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
    || hour > 23 || minute > 59 || second > 59) {
    return 'date 必须是规范的 +08:00 RFC 3339 日期时间'
  }
  return undefined
}

export function assertCompleteArticleMeta(meta: ArticleMeta): void {
  if (!meta.title.trim()) throw new Error('标题不能为空')
  if (!validateSlug(meta.slug).ok) throw new Error('Slug 只能包含小写英文、数字和单个连字符')
  const dateError = validateCanonicalBeijingDate(meta.date)
  if (dateError) throw new Error(dateError)
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

/** Publishing requirements must not prevent incomplete drafts from being saved/imported. */
export function assertPublishableArticle(meta: ArticleMeta, body: string): void {
  assertCompleteArticleMeta(meta)
  if (!meta.description.trim()) throw new Error('摘要不能为空，请在文章设置中填写摘要后再推送')
  if (!body.trim()) throw new Error('正文不能为空，请填写文章内容后再推送')
  if (meta.draft) throw new Error('推送文章必须设为已发布，请刷新 Studio 后重新推送')
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

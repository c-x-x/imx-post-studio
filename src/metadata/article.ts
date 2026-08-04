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

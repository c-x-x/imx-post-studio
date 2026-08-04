import { parse, TomlDate } from 'smol-toml'
import type { ArticleDraft, ArticleMeta } from './article'
import { validateSlug } from './slug'

export interface ParsedArticle {
  meta: ArticleMeta
  body: string
  coverPath?: string
}

const RFC_3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function formatBeijingDateTime(date: Date): string {
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return `${beijingTime.toISOString().slice(0, 19)}+08:00`
}

function normalizeDate(value: unknown): string {
  if (value instanceof TomlDate) {
    if (value.isDate()) {
      return `${value.toISOString()}T00:00:00+08:00`
    }

    if (!value.isDateTime() || value.isLocal() || Number.isNaN(value.getTime())) {
      throw new Error('date 必须是 RFC 3339 日期时间或日期')
    }

    return formatBeijingDateTime(value)
  }

  if (typeof value !== 'string') {
    throw new Error('date 必须是 RFC 3339 日期时间或日期')
  }

  if (DATE_ONLY.test(value)) {
    const date = new Date(`${value}T00:00:00+08:00`)
    if (Number.isNaN(date.getTime())) {
      throw new Error('date 不是有效日期')
    }
    return `${value}T00:00:00+08:00`
  }

  if (!RFC_3339.test(value)) {
    throw new Error('date 必须是 RFC 3339 日期时间或日期')
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error('date 不是有效日期时间')
  }
  return formatBeijingDateTime(date)
}

function stringField(table: Record<string, unknown>, key: string, fallback: string): string {
  const value = table[key]
  if (value === undefined) return fallback
  if (typeof value !== 'string') throw new Error(`${key} 必须是字符串`)
  return value
}

function booleanField(table: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = table[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`${key} 必须是布尔值`)
  return value
}

function stringArrayField(table: Record<string, unknown>, key: string): string[] {
  const value = table[key]
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${key} 必须是字符串数组`)
  }
  return value
}

function coverPathFor(slug: string): string {
  return `/posts/${slug}/images/cover.webp`
}

function tomlStringArray(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`
}

function parseFrontMatter(source: string): { table: Record<string, unknown>; body: string } {
  const match = /^\+\+\+\n([\s\S]*?)\n\+\+\+(?:\n|$)([\s\S]*)$/.exec(source)
  if (!match) throw new Error('文章必须以完整的 +++ TOML Front Matter 包裹')

  const table = parse(match[1])
  return { table, body: match[2] }
}

export function serializeArticle(draft: ArticleDraft, draftOverride?: boolean): string {
  const cover = draft.media.find((asset) => asset.kind === 'cover')
  const values = [
    `title = ${JSON.stringify(draft.meta.title)}`,
    `date = ${JSON.stringify(draft.meta.date)}`,
    `draft = ${draftOverride ?? draft.meta.draft}`,
    `categories = ${tomlStringArray(draft.meta.categories)}`,
    `tags = ${tomlStringArray(draft.meta.tags)}`,
    ...(cover ? [`image = ${JSON.stringify(coverPathFor(draft.meta.slug))}`] : []),
    `description = ${JSON.stringify(draft.meta.description)}`,
    `toc = ${draft.meta.toc}`,
  ]

  return `+++\n${values.join('\n')}\n+++\n${normalizeLineEndings(draft.body)}`
}

export function parseArticle(source: string): ParsedArticle {
  const { table, body } = parseFrontMatter(normalizeLineEndings(source))
  const declaredSlug = stringField(table, 'slug', '')
  const image = table.image

  if (image !== undefined && typeof image !== 'string') {
    throw new Error('image 必须是字符串')
  }
  if (declaredSlug && !validateSlug(declaredSlug).ok) {
    throw new Error('slug 只能包含小写英文、数字和单个连字符')
  }

  const coverMatch = typeof image === 'string'
    ? /^\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/images\/cover\.webp$/.exec(image)
    : undefined
  if (image !== undefined && !coverMatch) {
    throw new Error('image 必须是当前文章的 /posts/<slug>/images/cover.webp 路径')
  }
  const slug = declaredSlug || coverMatch?.[1] || ''
  if (image !== undefined && image !== coverPathFor(slug)) {
    throw new Error('image 必须是当前文章的 /posts/<slug>/images/cover.webp 路径')
  }

  return {
    meta: {
      title: stringField(table, 'title', ''),
      slug,
      date: normalizeDate(table.date),
      draft: booleanField(table, 'draft', true),
      categories: stringArrayField(table, 'categories'),
      tags: stringArrayField(table, 'tags'),
      description: stringField(table, 'description', ''),
      toc: booleanField(table, 'toc', true),
    },
    body,
    ...(image === undefined ? {} : { coverPath: image }),
  }
}

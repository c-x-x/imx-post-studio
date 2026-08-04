import { parse, TomlDate } from 'smol-toml'
import type { ArticleDraft, ArticleMeta } from './article'
import { validateSlug } from './slug'

export interface ParsedArticle {
  meta: ArticleMeta
  body: string
  coverPath?: string
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const RFC_3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function validateCalendarDate(year: number, month: number, day: number): void {
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new Error('date 不是有效日期')
  }
}

function normalizeDateString(value: string): string {
  const dateOnly = DATE_ONLY.exec(value)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    validateCalendarDate(Number(year), Number(month), Number(day))
    return `${value}T00:00:00+08:00`
  }

  const dateTime = RFC_3339.exec(value)
  if (!dateTime) {
    throw new Error('date 必须是 RFC 3339 日期时间或日期')
  }

  const [, year, month, day, hour, minute, second, fraction, , , offsetHour, offsetMinute] = dateTime
  validateCalendarDate(Number(year), Number(month), Number(day))
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
    || (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) {
    throw new Error('date 不是有效 RFC 3339 日期时间')
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ?? ''}+08:00`
}

function normalizeDate(value: unknown, rawTomlDate?: string): string {
  if (value instanceof TomlDate) {
    if (!rawTomlDate) {
      throw new Error('date 必须是 RFC 3339 日期时间或日期')
    }
    return normalizeDateString(rawTomlDate)
  }

  if (typeof value !== 'string') {
    throw new Error('date 必须是 RFC 3339 日期时间或日期')
  }
  return normalizeDateString(value)
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

function tomlBasicString(value: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) {
        throw new Error('TOML 字符串不能包含未配对的 UTF-16 代理项')
      }
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) {
        throw new Error('TOML 字符串不能包含未配对的 UTF-16 代理项')
      }
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error('TOML 字符串不能包含未配对的 UTF-16 代理项')
    }
  }

  return JSON.stringify(value).replace(/\u007f/g, '\\u007F')
}

function tomlStringArray(values: string[]): string {
  return `[${values.map((value) => tomlBasicString(value)).join(', ')}]`
}

function parseFrontMatter(source: string): { table: Record<string, unknown>; header: string; body: string } {
  const match = /^\+\+\+\n([\s\S]*?)\n\+\+\+(?:\n|$)([\s\S]*)$/.exec(source)
  if (!match) throw new Error('文章必须以完整的 +++ TOML Front Matter 包裹')

  const header = match[1]
  const table = parse(header)
  return { table, header, body: match[2] }
}

function rawTomlDate(header: string): string | undefined {
  return /^[ \t]*date[ \t]*=[ \t]*([0-9T:.+\-Z]+)[ \t]*(?:#.*)?$/m.exec(header)?.[1]
}

export function serializeArticle(draft: ArticleDraft, draftOverride?: boolean): string {
  const cover = draft.media.find((asset) => asset.kind === 'cover')
  const values = [
    `title = ${tomlBasicString(draft.meta.title)}`,
    `date = ${tomlBasicString(draft.meta.date)}`,
    `draft = ${draftOverride ?? draft.meta.draft}`,
    `categories = ${tomlStringArray(draft.meta.categories)}`,
    `tags = ${tomlStringArray(draft.meta.tags)}`,
    ...(cover ? [`image = ${tomlBasicString(coverPathFor(draft.meta.slug))}`] : []),
    `description = ${tomlBasicString(draft.meta.description)}`,
    `toc = ${draft.meta.toc}`,
  ]

  return `+++\n${values.join('\n')}\n+++\n${normalizeLineEndings(draft.body)}`
}

export function parseArticle(source: string): ParsedArticle {
  const { table, header, body } = parseFrontMatter(normalizeLineEndings(source))
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
      date: normalizeDate(table.date, rawTomlDate(header)),
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

import { describe, expect, it } from 'vitest'
import { createArticleDraft, type ArticleDraft } from '../../src/metadata/article'
import { parseArticle, serializeArticle } from '../../src/metadata/frontmatter'

const draft: ArticleDraft = {
  id: 'draft-1',
  createdAt: '2026-06-13T09:00:00+08:00',
  updatedAt: '2026-06-13T09:00:00+08:00',
  meta: {
    title: '“Hugo” 图片："处理"',
    slug: 'hugo-tu-pian-chu-li-zhi-nan',
    date: '2026-06-13T09:00:00+08:00',
    draft: true,
    categories: ['技术', '教程'],
    tags: ['Hugo', '图片'],
    description: '包含 "引号" 的文章描述',
    featured: true,
    toc: true,
  },
  body: '# 标题\r\n\r\n![示例](images/example.png)\r\n',
  media: [{
    id: 'cover-1',
    name: 'cover.webp',
    kind: 'cover',
    mime: 'image/webp',
    blob: new Blob(['cover'], { type: 'image/webp' }),
  }],
}

describe('article TOML front matter', () => {
  it('creates a unique Beijing-time draft with safe defaults', () => {
    const now = new Date('2026-06-13T01:02:03Z')
    const first = createArticleDraft(now)
    const second = createArticleDraft(now)

    expect(first).toMatchObject({
      createdAt: '2026-06-13T09:02:03+08:00',
      updatedAt: '2026-06-13T09:02:03+08:00',
      meta: {
        title: '',
        slug: '',
        date: '2026-06-13T09:02:03+08:00',
        draft: true,
        categories: [],
        tags: [],
        description: '',
        featured: false,
        toc: true,
      },
      body: '',
      media: [],
    })
    expect(first.id).not.toBe(second.id)
  })

  it('serializes deterministic LF TOML and round-trips known article data', () => {
    const serialized = serializeArticle(draft)

    expect(serialized).toBe([
      '+++',
      'title = "“Hugo” 图片：\\"处理\\""',
      'slug = "hugo-tu-pian-chu-li-zhi-nan"',
      'date = "2026-06-13T09:00:00+08:00"',
      'draft = true',
      'categories = ["技术", "教程"]',
      'tags = ["Hugo", "图片"]',
      'image = "/posts/hugo-tu-pian-chu-li-zhi-nan/images/cover.webp"',
      'description = "包含 \\"引号\\" 的文章描述"',
      'featured = true',
      'toc = true',
      '+++',
      '# 标题',
      '',
      '![示例](images/example.png)',
      '',
    ].join('\n'))
    expect(serialized).not.toContain('\r')
    expect(parseArticle(serialized)).toEqual({
      meta: draft.meta,
      body: '# 标题\n\n![示例](images/example.png)\n',
      coverPath: '/posts/hugo-tu-pian-chu-li-zhi-nan/images/cover.webp',
    })
  })

  it('normalizes a TOML date-only value to Beijing midnight', () => {
    expect(parseArticle('+++\ndate = 2026-06-13\n+++\n正文').meta.date)
      .toBe('2026-06-13T00:00:00+08:00')
  })

  it('defaults legacy articles to non-featured and validates the featured field type', () => {
    expect(parseArticle('+++\ndate = 2026-06-13\n+++\n正文').meta.featured).toBe(false)
    expect(() => parseArticle('+++\ndate = 2026-06-13\nfeatured = "true"\n+++\n')).toThrow('featured 必须是布尔值')
  })

  it('normalizes offset date-times to Beijing without moving their intended date', () => {
    expect(parseArticle('+++\ndate = "2026-06-13T23:30:00-04:00"\n+++\n').meta.date)
      .toBe('2026-06-13T23:30:00+08:00')
    expect(parseArticle('+++\ndate = "2026-06-13T00:30:00+14:00"\n+++\n').meta.date)
      .toBe('2026-06-13T00:30:00+08:00')
  })

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-01',
    '2026-06-31',
    '2026-06-13T24:00:00+08:00',
    '2026-06-13T12:60:00+08:00',
    '2026-06-13T12:00:60+08:00',
    '2026-06-13T12:00:00+24:00',
    '2026-06-13T12:00:00+08:60',
  ])('rejects impossible or out-of-range RFC 3339 values: %s', (date) => {
    expect(() => parseArticle(`+++\ndate = "${date}"\n+++\n`)).toThrow()
  })

  it.each(['', '  ', '\t'])('rejects impossible unquoted TOML calendar dates before parser rollover', (indent) => {
    expect(() => parseArticle(`+++\n${indent}date = 2026-02-30\n+++\n`)).toThrow()
  })

  it.each(['  ', '\t'])('accepts an indented unquoted TOML date with %s', (indent) => {
    expect(parseArticle(`+++\n${indent}date = 2026-06-13\n+++\n`).meta.date)
      .toBe('2026-06-13T00:00:00+08:00')
  })

  it.each([
    ['title', 'title = true'],
    ['slug', 'slug = true'],
    ['date', 'date = true'],
    ['draft', 'draft = "true"'],
    ['categories', 'categories = "技术"'],
    ['tags', 'tags = ["Hugo", true]'],
    ['image', 'image = true'],
    ['description', 'description = true'],
    ['featured', 'featured = "true"'],
    ['toc', 'toc = "true"'],
  ])('rejects %s with an invalid known-field type', (_field, line) => {
    const date = line.startsWith('date =') ? '' : 'date = "2026-06-13T09:00:00+08:00"\n'
    expect(() => parseArticle(`+++\n${date}${line}\n+++\n`)).toThrow()
  })

  it('rejects noncanonical cover paths separately from field types', () => {
    expect(() => parseArticle('+++\nimage = "images/cover.webp"\n+++\n')).toThrow()
  })

  it('uses TOML-safe escapes for scalar and array strings', () => {
    const escapedDraft: ArticleDraft = {
      ...draft,
      meta: {
        ...draft.meta,
        title: '删除\u007f字符\\并换行\n',
        categories: ['技术\n写作', '控制\u000b字符'],
        tags: ['反斜杠\\', '制表\t符'],
        description: '包含 "引号" 和\r回车',
      },
    }

    const serialized = serializeArticle(escapedDraft)

    expect(serialized).toContain('\\u007F')
    expect(serialized).not.toContain('\u007f')
    expect(parseArticle(serialized).meta).toEqual(escapedDraft.meta)
  })

  it('rejects malformed UTF-16 before serializing TOML strings', () => {
    const malformedDraft: ArticleDraft = {
      ...draft,
      meta: { ...draft.meta, title: '损坏\ud800字符' },
    }

    expect(() => serializeArticle(malformedDraft)).toThrow()
  })

  it.each([
    ['a scalar', { ...draft.meta, title: 'bad\ud800' }],
    ['an array member', { ...draft.meta, categories: ['bad\ud800'] }],
  ])('rejects a terminal high surrogate in %s', (_location, meta) => {
    expect(() => serializeArticle({ ...draft, meta })).toThrow()
  })

  it('round-trips a valid astral Unicode character', () => {
    const astralDraft: ArticleDraft = {
      ...draft,
      meta: { ...draft.meta, title: 'Hugo 😀 图片' },
    }

    expect(parseArticle(serializeArticle(astralDraft)).meta.title).toBe('Hugo 😀 图片')
  })
})

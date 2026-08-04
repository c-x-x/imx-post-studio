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
      'date = "2026-06-13T09:00:00+08:00"',
      'draft = true',
      'categories = ["技术", "教程"]',
      'tags = ["Hugo", "图片"]',
      'image = "/posts/hugo-tu-pian-chu-li-zhi-nan/images/cover.webp"',
      'description = "包含 \\"引号\\" 的文章描述"',
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

  it('rejects malformed known fields and cover paths', () => {
    expect(() => parseArticle('+++\ndraft = "true"\n+++\n')).toThrow()
    expect(() => parseArticle('+++\nimage = "images/cover.webp"\n+++\n')).toThrow()
  })
})

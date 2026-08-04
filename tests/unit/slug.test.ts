import { describe, expect, it } from 'vitest'
import { suggestSlug, validateSlug } from '../../src/metadata/slug'

describe('article slugs', () => {
  it('transliterates Chinese titles into a URL-safe suggestion', () => {
    expect(suggestSlug('Hugo 图片处理指南')).toBe('hugo-tu-pian-chu-li-zhi-nan')
  })

  it('accepts lowercase words separated by single hyphens', () => {
    expect(validateSlug('valid-post').ok).toBe(true)
  })

  it('rejects whitespace, Chinese, edge, and repeated hyphens', () => {
    for (const value of ['My Post', '中文', '-bad', 'bad-', 'bad--slug']) {
      expect(validateSlug(value).ok).toBe(false)
    }
  })
})

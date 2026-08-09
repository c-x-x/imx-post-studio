import { describe, expect, it } from 'vitest'
import { extractEditorOutline } from '../../src/editor/outline'

describe('extractEditorOutline', () => {
  it('returns heading text, depth, and exact source offsets in document order', () => {
    const markdown = [
      '# 一级标题',
      '',
      '正文',
      '',
      '### 三 *级* 标题',
      '',
      '# 一级标题',
    ].join('\n')

    expect(extractEditorOutline(markdown)).toEqual([
      { depth: 1, text: '一级标题', from: 0 },
      { depth: 3, text: '三 级 标题', from: markdown.indexOf('###') },
      { depth: 1, text: '一级标题', from: markdown.lastIndexOf('#') },
    ])
  })

  it('ignores body text and returns an empty outline without headings', () => {
    expect(extractEditorOutline('只有正文\n\n- 列表')).toEqual([])
  })
})

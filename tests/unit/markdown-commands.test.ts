import { describe, expect, it } from 'vitest'
import { insertMarkdownImages, runMarkdownCommand } from '../../src/editor/markdown-commands'

describe('runMarkdownCommand', () => {
  it('wraps the selected text in bold markers and retains the selected content', () => {
    expect(runMarkdownCommand('hello world', { from: 6, to: 11 }, { type: 'bold' })).toEqual({
      value: 'hello **world**',
      selection: { from: 8, to: 13 },
    })
  })

  it('wraps the selected text in italic markers and retains the selected content', () => {
    expect(runMarkdownCommand('文字', { from: 0, to: 2 }, { type: 'italic' })).toEqual({
      value: '*文字*',
      selection: { from: 1, to: 3 },
    })
  })

  it('creates an unchecked task and retains the selected content', () => {
    expect(runMarkdownCommand('任务', { from: 0, to: 2 }, { type: 'task' })).toEqual({
      value: '- [ ] 任务',
      selection: { from: 6, to: 8 },
    })
  })

  it.each([
    ['heading', { type: 'heading' } as const, '## Article'],
    ['list', { type: 'list' } as const, '- Article'],
    ['quote', { type: 'quote' } as const, '> Article'],
    ['fenced code', { type: 'code' } as const, '```\nArticle\n```'],
    ['link', { type: 'link' } as const, '[Article](https://)'],
  ])('inserts %s Markdown without replacing the selection', (_name, command, value) => {
    const result = runMarkdownCommand('Article', { from: 0, to: 7 }, command)

    expect(result.value).toBe(value)
    expect(result.selection.from).toBeGreaterThanOrEqual(0)
    expect(result.selection.to).toBeLessThanOrEqual(value.length)
  })

  it('inserts a local image reference at the cursor with no second editor value', () => {
    expect(runMarkdownCommand('before after', { from: 7, to: 7 }, {
      type: 'image', name: 'image-name.png', alt: '图片说明',
    })).toEqual({
      value: 'before ![图片说明](images/image-name.png)after',
      selection: { from: 9, to: 13 },
    })
  })
})

describe('insertMarkdownImages', () => {
  it('inserts multiple images as a standalone block in clipboard order', () => {
    expect(insertMarkdownImages('正文前正文后', { from: 3, to: 3 }, [
      { alt: '第一张', name: 'first.png' },
      { alt: '第二张', name: 'second.webp' },
    ])).toEqual({
      value: '正文前\n\n![第一张](images/first.png)\n\n![第二张](images/second.webp)\n\n正文后',
      selection: { from: 57, to: 57 },
    })
  })

  it('replaces the selection without adding empty boundary paragraphs', () => {
    expect(insertMarkdownImages('删除这段', { from: 0, to: 4 }, [
      { alt: '图片', name: 'image.png' },
    ])).toEqual({
      value: '![图片](images/image.png)',
      selection: { from: 23, to: 23 },
    })
  })
})

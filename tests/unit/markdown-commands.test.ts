import { describe, expect, it } from 'vitest'
import { runMarkdownCommand } from '../../src/editor/markdown-commands'

describe('runMarkdownCommand', () => {
  it('wraps the selected text in bold markers and retains the selected content', () => {
    expect(runMarkdownCommand('hello world', { from: 6, to: 11 }, { type: 'bold' })).toEqual({
      value: 'hello **world**',
      selection: { from: 8, to: 13 },
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

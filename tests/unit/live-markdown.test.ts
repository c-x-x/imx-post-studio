import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { GFM } from '@lezer/markdown'
import { afterEach, describe, expect, test } from 'vitest'
import { liveMarkdown, type LiveMarkdownImage } from '../../src/editor/live-markdown'

const views: EditorView[] = []

function createView(doc: string, selection: number, mode: 'rich' | 'source' = 'rich', images = new Map<string, LiveMarkdownImage>()) {
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: selection },
      extensions: [markdown({ extensions: GFM }), liveMarkdown({ mode, images })],
    }),
  })
  views.push(view)
  return view
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove()
    view.destroy()
  }
})

describe('liveMarkdown', () => {
  const documentText = [
    '# 标题',
    '',
    '普通 **粗体**、*斜体*、~~删除线~~、`代码` 和 [链接](https://example.com)。',
    '',
    '> 引用',
  ].join('\n')

  test('formats inactive blocks and reveals the complete active block source', () => {
    const paragraph = documentText.indexOf('普通')
    const view = createView(documentText, documentText.indexOf('引用'))

    expect(view.dom.querySelector('.cm-md-heading-1')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-strong')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-emphasis')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-strikethrough')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-inline-code')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-link')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-quote')).toBeTruthy()
    expect(view.dom.querySelectorAll('.cm-md-hidden').length).toBeGreaterThan(0)

    view.dispatch({ selection: { anchor: paragraph + 8 } })

    expect(view.dom.querySelector('.cm-md-strong .cm-md-hidden')).toBeNull()
    expect(view.dom.querySelector('.cm-md-emphasis .cm-md-hidden')).toBeNull()
    expect(view.dom.querySelector('.cm-md-link .cm-md-hidden')).toBeNull()
  })

  test('keeps literal Markdown untouched in source mode', () => {
    const view = createView(documentText, 0, 'source')

    expect(view.contentDOM.textContent).toContain('**粗体**')
    expect(view.contentDOM.textContent).toContain('[链接](https://example.com)')
    expect(view.dom.querySelector('.cm-md-hidden')).toBeNull()
    expect(view.dom.querySelector('.cm-md-image')).toBeNull()
  })

  test('does not change hidden markers during IME composition', () => {
    const view = createView(documentText, documentText.indexOf('引用'))
    const before = Array.from(view.dom.querySelectorAll('.cm-md-hidden'), (node) => node.textContent)

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '拼' }))
    view.dispatch({ selection: { anchor: documentText.indexOf('普通') + 8 } })

    expect(Array.from(view.dom.querySelectorAll('.cm-md-hidden'), (node) => node.textContent)).toEqual(before)

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '拼' }))
    expect(view.dom.querySelector('.cm-md-strong .cm-md-hidden')).toBeNull()
  })

  test('renders only resolved local images as safe DOM widgets', () => {
    const doc = ['光标在这里', '', '![图](images/a.png)', '', '![远程](https://example.com/a.png)'].join('\n')
    const images = new Map<string, LiveMarkdownImage>([
      ['a.png', { alt: '图', name: 'a.png', url: 'blob:local-image' }],
    ])
    const view = createView(doc, 0, 'rich', images)

    const image = view.dom.querySelector<HTMLImageElement>('.cm-md-image img')
    expect(image?.src).toBe('blob:local-image')
    expect(image?.alt).toBe('图')
    expect(view.contentDOM.textContent).toContain('![远程](https://example.com/a.png)')
  })

  test('formats lists, fenced code, and horizontal rules outside the active block', () => {
    const doc = ['当前段落', '', '- 列表', '', '```ts', 'const answer = 42', '```', '', '---'].join('\n')
    const view = createView(doc, 0)

    expect(view.dom.querySelector('.cm-md-list')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-fenced-code')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-horizontal-rule')).toBeTruthy()
  })
})

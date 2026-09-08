import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { MarkdownEditor } from '../../src/editor/MarkdownEditor'
import { MetadataPanel } from '../../src/metadata/MetadataPanel'
import { createArticleDraft } from '../../src/metadata/article'
import { renderMarkdown } from '../../src/preview/markdown'

afterEach(cleanup)
function rich(source: string) {
  render(<MarkdownEditor value={source} onChange={() => {}} media={[]} />)
  return (screen.getByRole('textbox', { name: 'Markdown 编辑器' }) as HTMLElement & { editor: Editor }).editor
}

it.each(['    ', '\t'])('preserves multi-paragraph footnotes with %j indentation through repeated parsing', async (indent) => {
  const source = `正文[^n]\n\n[^n]: 第一行\n\n${indent}第二行\n\n后文`
  const editor = rich(source)
  for (let round = 0; round < 3; round += 1) {
    const output = editor.getMarkdown()
    const preview = await renderMarkdown(output, () => undefined)
    expect(preview.html.slice(preview.html.indexOf('<section'))).toContain('第二行')
    expect(preview.html.slice(preview.html.indexOf('<section'))).not.toContain('后文')
    expect(preview.html).not.toContain('class="highlight"')
    act(() => { editor.commands.setContent(output, { contentType: 'markdown' }) })
  }
})

it('retains escaped image alt and title when editing source', async () => {
  const editor = rich('![a\\]b](images/a.png "a\\"b")')
  act(() => { editor.commands.setNodeSelection(0) })
  const input = await screen.findByLabelText('图片 Markdown 源码')
  expect(input).toHaveValue('![a\\]b](images/a.png "a\\"b")')
  fireEvent.change(input, { target: { value: (input as HTMLTextAreaElement).value.replace('a', 'A') } })
  expect(editor.state.doc.firstChild?.type.name).toBe('image')
  expect(editor.state.doc.firstChild?.attrs.alt).toBe('A]b')
  expect(editor.state.doc.firstChild?.attrs.title).toBe('a"b')
  const output = editor.getMarkdown()
  expect(output).toContain('![A\\]b](images/a.png "a\\"b")')
  const preview = await renderMarkdown(output, () => 'blob:image')
  expect(preview.html).toContain('alt="A]b"')
})

it.each(['分类', '标签'])('does not submit %s while Enter confirms an IME candidate', (label) => {
  const onChange = vi.fn()
  render(<MetadataPanel meta={createArticleDraft().meta} onChange={onChange} />)
  const input = screen.getByLabelText(label)
  fireEvent.compositionStart(input)
  fireEvent.change(input, { target: { value: 'zhongwen' } })
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 13, isComposing: true })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: false })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.compositionEnd(input)
  fireEvent.change(input, { target: { value: '中文' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onChange).toHaveBeenCalledWith(label === '分类' ? 'categories' : 'tags', ['中文'])
})

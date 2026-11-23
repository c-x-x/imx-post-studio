import { afterEach, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { MarkdownEditor, type MarkdownEditorHandle } from '../../src/editor/MarkdownEditor'
import { SourceMarkdownEditor, type SourceMarkdownEditorHandle } from '../../src/editor/SourceMarkdownEditor'
import type { MediaAsset } from '../../src/metadata/article'

afterEach(cleanup)

function richEditor(): Editor {
  return (screen.getByRole('textbox', { name: 'Markdown 编辑器' }) as HTMLElement & { editor: Editor }).editor
}

it.each(['粘贴文字', '**Markdown粘贴**'])('pastes %s even when the browser retains a composition flag', (text) => {
  const onChange = vi.fn()
  render(<MarkdownEditor value="前后" onChange={onChange} media={[]} />)
  const editor = richEditor()
  act(() => { editor.commands.setTextSelection(2) })
  const composing = vi.spyOn(editor.view, 'composing', 'get').mockReturnValue(true)
  fireEvent.paste(editor.view.dom, { clipboardData: {
    items: [], files: [], getData: (type: string) => type === 'text/plain' ? text : '',
  } })
  composing.mockRestore()
  expect(editor.state.doc.textContent).toBe(`前${text.replaceAll('**', '')}后`)
  expect(onChange.mock.calls.at(-1)?.[0].replace(/\n/g, '')).toBe(`前${text}后`)
})

it('keeps a pasted inline Markdown fragment and its surrounding spaces inside the paragraph', () => {
  const onChange = vi.fn()
  render(<MarkdownEditor value="前后" onChange={onChange} media={[]} />)
  const editor = richEditor()
  act(() => { editor.commands.setTextSelection(2) })
  fireEvent.paste(editor.view.dom, { clipboardData: {
    items: [], files: [], getData: (type: string) => type === 'text/plain' ? ' **强调** ' : '',
  } })
  expect(editor.state.doc.firstChild?.textContent).toBe('前 强调 后')
  expect(editor.state.doc.firstChild?.childCount).toBe(3)
  expect(editor.view.dom.querySelector('strong')).toHaveTextContent('强调')
  expect(onChange).toHaveBeenLastCalledWith('前 **强调** 后')
})

it('replaces selected text with inline Markdown and undoes the paste as one edit', () => {
  render(<MarkdownEditor value="前旧文后" onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  act(() => { editor.commands.setTextSelection({ from: 2, to: 4 }) })
  fireEvent.paste(editor.view.dom, { clipboardData: {
    items: [], files: [], getData: (type: string) => type === 'text/plain' ? '**新文**' : '',
  } })
  expect(editor.state.doc.firstChild?.textContent).toBe('前新文后')
  expect(editor.view.dom.querySelector('strong')).toHaveTextContent('新文')
  act(() => { editor.commands.undo() })
  expect(editor.state.doc.firstChild?.textContent).toBe('前旧文后')
})

it('reports a failed text paste instead of silently swallowing it', () => {
  render(<MarkdownEditor value="正文" onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  const paste = vi.spyOn(editor.view, 'pasteText').mockReturnValue(false)
  fireEvent.paste(editor.view.dom, { clipboardData: {
    items: [], files: [], getData: (type: string) => type === 'text/plain' ? '粘贴文字' : '',
  } })
  expect(screen.getByRole('alert')).toHaveTextContent('粘贴失败')
  paste.mockRestore()
})

it('keeps pasted syntax, indentation and blank lines inside the code block', () => {
  render(<MarkdownEditor value={'```text\nstart\n```'} onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  act(() => { editor.commands.setTextSelection(6) })
  const source = '\n  # comment\n**literal**\n\n'
  fireEvent.paste(editor.view.dom, { clipboardData: {
    items: [], files: [], getData: (type: string) => type === 'text/plain' ? source : '',
  } })
  expect(editor.state.doc.firstChild?.type.name).toBe('codeBlock')
  expect(editor.state.doc.firstChild?.textContent).toBe(`start${source}`)
  expect(editor.view.dom.querySelector('h1, strong')).toBeNull()
  act(() => { editor.commands.undo() })
  expect(editor.state.doc.firstChild?.textContent).toBe('start')
})

it.each([
  ['formula', '$$\nx\n$$', 'LaTeX 源码', '$$\ny\n$$'],
  ['diagram', '```mermaid\n\n```', 'Mermaid 源码', '```mermaid\ngraph TD; A-->B\n```'],
  ['image', '![old](images/a.png)', '图片 Markdown 源码', '![new](images/a.png)'],
  ['callout', '> [!NOTE]\n> old', '提醒内容正文', 'new'],
])('locks and unlocks the %s source with the editor', async (_kind, value, label, replacement) => {
  const onChange = vi.fn()
  const { rerender } = render(<MarkdownEditor value={value} onChange={onChange} media={[]} />)
  act(() => { richEditor().commands.setNodeSelection(0) })
  const input = await screen.findByLabelText(label)
  rerender(<MarkdownEditor value={value} onChange={onChange} media={[]} disabled />)
  expect(input).toHaveAttribute('readonly')
  onChange.mockClear()
  fireEvent.change(input, { target: { value: replacement } })
  fireEvent.compositionEnd(input, { target: { value: replacement } })
  expect(onChange).not.toHaveBeenCalled()
  rerender(<MarkdownEditor value={value} onChange={onChange} media={[]} />)
  expect(input).not.toHaveAttribute('readonly')
  fireEvent.change(input, { target: { value: replacement } })
  expect(onChange).toHaveBeenCalled()
})

it('starts rich history at the source document and preserves subsequent undo/redo', async () => {
  const onChange = vi.fn()
  const { rerender } = render(<MarkdownEditor value="first" onChange={onChange} media={[]} />)
  act(() => { richEditor().commands.insertContent('rich edit') })
  rerender(<MarkdownEditor initialMode="source" value="source latest" onChange={onChange} media={[]} />)
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Markdown 编辑器' }).className).toContain('cm-content'))
  rerender(<MarkdownEditor initialMode="rich" value="source latest" onChange={onChange} media={[]} />)
  const editor = richEditor()
  expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
  expect(editor.can().undo()).toBe(false)
  act(() => { editor.commands.undo() })
  expect(editor.state.doc.textContent).toBe('source latest')
  act(() => { editor.commands.insertContent('new ') })
  const changed = editor.state.doc.textContent
  expect(changed).not.toBe('source latest')
  act(() => { editor.commands.undo() })
  expect(editor.state.doc.textContent).toBe('source latest')
  act(() => { editor.commands.redo() })
  expect(editor.state.doc.textContent).toBe(changed)
})

it('undoes an asynchronous image paste back to the captured caret', async () => {
  let finishPaste!: (assets: MediaAsset[]) => void
  const preparePastedImages = vi.fn(() => new Promise<MediaAsset[]>((resolve) => { finishPaste = resolve }))
  const commitPastedImages = vi.fn()
  render(<MarkdownEditor
    value="前面后面"
    onChange={() => undefined}
    media={[]}
    preparePastedImages={preparePastedImages}
    onCommitPastedImages={commitPastedImages}
  />)
  const editor = richEditor()
  act(() => { editor.commands.setTextSelection(3) })
  fireEvent.paste(editor.view.dom, { clipboardData: {
    items: [],
    files: [new File(['image'], 'pasted.png', { type: 'image/png' })],
    getData: () => '',
  } })
  expect(preparePastedImages).toHaveBeenCalled()

  // Image decoding temporarily locks and blurs the real editor. Reproduce a
  // browser moving its live selection to the start before decoding finishes.
  act(() => { editor.commands.setTextSelection(1) })
  const asset: MediaAsset = {
    id: 'pasted-image',
    name: 'pasted.png',
    kind: 'body',
    mime: 'image/png',
    blob: new Blob(['image'], { type: 'image/png' }),
  }
  await act(async () => { finishPaste([asset]) })
  await waitFor(() => expect(commitPastedImages).toHaveBeenCalled())

  act(() => { editor.commands.undo() })
  expect(editor.state.selection.from).toBe(3)
})

it('keeps the captured source caret outside asynchronous image-paste history', async () => {
  let finishPaste!: (assets: MediaAsset[]) => void
  const preparePastedImages = vi.fn(() => new Promise<MediaAsset[]>((resolve) => { finishPaste = resolve }))
  const commitPastedImages = vi.fn()
  const onChange = vi.fn()
  const editorRef = createRef<SourceMarkdownEditorHandle>()
  render(<SourceMarkdownEditor
    ref={editorRef}
    value="源码前源码后"
    onChange={onChange}
    disabled={false}
    preparePastedImages={preparePastedImages}
    onCommitPastedImages={commitPastedImages}
  />)
  const editor = await screen.findByRole('textbox', { name: 'Markdown 编辑器' })
  act(() => { editorRef.current?.focusPosition(3) })
  fireEvent.paste(editor, { clipboardData: {
    items: [],
    files: [new File(['image'], 'source.png', { type: 'image/png' })],
  } })
  expect(preparePastedImages).toHaveBeenCalled()

  act(() => { editorRef.current?.focusPosition(0) })
  const asset: MediaAsset = {
    id: 'source-image',
    name: 'source.png',
    kind: 'body',
    mime: 'image/png',
    blob: new Blob(['image'], { type: 'image/png' }),
  }
  await act(async () => { finishPaste([asset]) })
  await waitFor(() => expect(commitPastedImages).toHaveBeenCalled())

  act(() => {
    editorRef.current?.undo()
    editorRef.current?.insertMarkdown('撤销后')
  })
  expect(onChange.mock.calls.at(-1)?.[0]).toBe('源码前撤销后源码后')
})

it('keeps selected code intact when indenting and outdenting several lines', () => {
  render(<MarkdownEditor value={'```js\none\ntwo\nthree\n```'} onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  act(() => { editor.commands.setTextSelection({ from: 2, to: 8 }) })
  fireEvent.keyDown(editor.view.dom, { key: 'Tab' })
  expect(editor.state.doc.firstChild?.textContent).toBe('  one\n  two\nthree')
  expect(editor.state.selection.empty).toBe(false)
  fireEvent.keyDown(editor.view.dom, { key: 'Tab', shiftKey: true })
  expect(editor.state.doc.firstChild?.textContent).toBe('one\ntwo\nthree')
  expect([editor.state.selection.from, editor.state.selection.to]).toEqual([2, 8])
})

it('jumps to the intended outline item while an earlier heading shows its editable prefix', () => {
  const ref = createRef<MarkdownEditorHandle>()
  const markdown = '开头\n\n## 第一节\n\n## 第二节\n\n## 第三节'
  render(<MarkdownEditor ref={ref} value={markdown} onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  act(() => { ref.current!.focusPosition(markdown.indexOf('## 第一节')) })
  expect(editor.state.selection.$from.parent.textContent).toContain('## 第一节')
  act(() => { ref.current!.focusPosition(markdown.indexOf('## 第二节')) })
  expect(editor.state.selection.$from.parent.textContent).toContain('第二节')
})

it('undoes a Markdown paste independently of the immediately preceding keystroke', () => {
  render(<MarkdownEditor value="正文" onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  act(() => { editor.chain().setTextSelection(3).insertContent('甲').run() })
  fireEvent.paste(editor.view.dom, { clipboardData: {
    items: [], files: [], getData: (type: string) => type === 'text/plain' ? '**乙**' : '',
  } })
  expect(editor.state.doc.firstChild?.textContent).toBe('正文甲乙')
  act(() => { editor.commands.undo() })
  expect(editor.state.doc.firstChild?.textContent).toBe('正文甲')
  expect(editor.state.selection.from).toBe(4)
})

it.each([['Backspace', '前', 1], ['Delete', '后', 0]] as const)(
  '%s in an empty callout leaves the caret on the corresponding side',
  async (key, paragraph, offset) => {
    render(<MarkdownEditor value={'前\n\n> [!NOTE]\n> 内容\n\n后'} onChange={() => undefined} media={[]} />)
    const editor = richEditor()
    act(() => { editor.commands.setNodeSelection(editor.state.doc.firstChild!.nodeSize) })
    const field = await screen.findByLabelText('提醒内容正文')
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.keyDown(field, { key })
    expect(editor.view.dom.querySelector('.callout-block-view')).toBeNull()
    expect(editor.state.selection.$from.parent.textContent).toBe(paragraph)
    expect(editor.state.selection.$from.parentOffset).toBe(offset)
  },
)

it('keeps the callout and its editing field during IME cancellation', async () => {
  render(<MarkdownEditor value={'> [!NOTE]\n> 旧文'} onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  act(() => { editor.commands.setNodeSelection(0) })
  const field = await screen.findByLabelText('提醒内容正文')
  fireEvent.change(field, { target: { value: '' } })
  fireEvent.compositionStart(field)
  fireEvent.keyDown(field, { key: 'Backspace', isComposing: true })
  expect(field).toBeInTheDocument()
  fireEvent.keyDown(field, { key: 'Escape', isComposing: true })
  expect(field).toBeInTheDocument()
})

it('preserves a pasted indented code sample containing Markdown punctuation', () => {
  render(<MarkdownEditor value="" onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  fireEvent.paste(editor.view.dom, { clipboardData: {
    items: [], files: [], getData: (type: string) => type === 'text/plain' ? '    # comment\r\n    echo ok' : '',
  } })
  expect(editor.state.doc.firstChild?.type.name).toBe('codeBlock')
  expect(editor.state.doc.firstChild?.textContent).toBe('# comment\necho ok')
})

it('counts a newly typed heading in outline navigation before leaving its line', () => {
  const ref = createRef<MarkdownEditorHandle>()
  const markdown = '预留\n\n## 第二节\n\n## 第三节'
  render(<MarkdownEditor ref={ref} value={markdown} onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  act(() => { editor.view.dispatch(editor.state.tr.insertText('## ', 1)) })
  act(() => { ref.current!.focusPosition(('## ' + markdown).indexOf('## 第二节')) })
  expect(editor.state.selection.$from.parent.textContent).toContain('第二节')
})

it.each(['## 标题', '**加粗**'])('keeps navigation through %s out of the undo history', async (line) => {
  render(<MarkdownEditor value={'上文\n\n' + line + '\n\n下文'} onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  await waitFor(() => expect(editor.state.doc.lastChild?.content.size).toBe(0))
  expect(editor.can().undo()).toBe(false)
  const middle = editor.state.doc.firstChild!.nodeSize + 2
  act(() => { editor.commands.setTextSelection(middle) })
  act(() => { editor.commands.setTextSelection(1) })
  expect(editor.can().undo()).toBe(false)
})

it.each(['## 标题', '**加粗**'])('keeps redo available after navigating through %s', async (line) => {
  render(<MarkdownEditor value={'上文\n\n' + line} onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  await waitFor(() => expect(editor.state.doc.lastChild?.content.size).toBe(0))
  act(() => { editor.view.dispatch(editor.state.tr.insertText('新', 2)) })
  act(() => { editor.commands.undo() })
  act(() => { editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize + 2) })
  act(() => { editor.commands.setTextSelection(1) })
  act(() => { expect(editor.commands.redo()).toBe(true) })
  expect(editor.state.doc.firstChild?.textContent).toBe('上新文')
})

it('deletes the visible backward selection before the delayed selectionchange arrives', async () => {
  render(<MarkdownEditor value="前原文后" onChange={() => undefined} media={[]} />)
  const editor = richEditor()
  await waitFor(() => expect(editor.state.doc.lastChild?.content.size).toBe(0))
  act(() => {
    editor.commands.setTextSelection(5)
    editor.view.focus()
    const text = editor.view.dom.querySelector('p')!.firstChild!
    window.getSelection()!.setBaseAndExtent(text, 3, text, 1)
  })
  fireEvent.keyDown(editor.view.dom, { key: 'Delete', keyCode: 46 })
  expect(editor.state.doc.firstChild?.textContent).toBe('前后')
  act(() => { editor.commands.undo() })
  expect(editor.state.doc.firstChild?.textContent).toBe('前原文后')
  expect([editor.state.selection.anchor, editor.state.selection.head]).toEqual([4, 2])
})

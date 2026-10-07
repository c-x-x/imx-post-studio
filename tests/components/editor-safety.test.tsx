import { afterEach, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { MarkdownEditor } from '../../src/editor/MarkdownEditor'
import { SourceMarkdownEditor, type SourceMarkdownEditorHandle } from '../../src/editor/SourceMarkdownEditor'
import type { MediaAsset } from '../../src/metadata/article'

afterEach(cleanup)

function richEditor(): Editor {
  return (screen.getByRole('textbox', { name: 'Markdown 编辑器' }) as HTMLElement & { editor: Editor }).editor
}

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

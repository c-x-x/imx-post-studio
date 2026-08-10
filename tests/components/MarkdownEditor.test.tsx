import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { undo } from '@codemirror/commands'
import { EditorView } from '@uiw/react-codemirror'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { MarkdownEditor } from '../../src/editor/MarkdownEditor'
import type { MediaAsset } from '../../src/metadata/article'

afterEach(cleanup)

function imageAsset(id: string, name: string): MediaAsset {
  return { id, name, kind: 'body', mime: 'image/png', blob: new Blob(['png'], { type: 'image/png' }) }
}

function clipboardItem(file?: File, type = file?.type ?? 'text/plain') {
  return { kind: file ? 'file' : 'string', type, getAsFile: () => file ?? null }
}

function dispatchPaste(target: HTMLElement, items: Array<ReturnType<typeof clipboardItem>>, text = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items,
      files: items.flatMap((item) => item.getAsFile() ?? []),
      getData: (type: string) => type === 'text/plain' ? text : '',
    },
  })
  fireEvent(target, event)
  return event
}

describe('MarkdownEditor', () => {
  test('configures and inserts a table while preserving editor selection', () => {
    function ControlledEditor() {
      const [value, setValue] = useState('前文后文')
      return <MarkdownEditor value={value} onChange={setValue} media={[]} />
    }

    render(<ControlledEditor />)
    const textbox = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    const view = EditorView.findFromDOM(textbox)
    if (!view) throw new Error('CodeMirror view not found')
    view.dispatch({ selection: { anchor: 2 } })

    fireEvent.click(screen.getByRole('button', { name: '表格' }))
    const dialog = screen.getByRole('dialog', { name: '插入表格' })
    const columns = within(dialog).getByLabelText('列数')
    const rows = within(dialog).getByLabelText('数据行数')
    expect(columns).toHaveValue(3)
    expect(rows).toHaveValue(2)
    expect(document.activeElement).toBe(columns)

    fireEvent.change(columns, { target: { value: '8' } })
    fireEvent.change(rows, { target: { value: '20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '插入' }))

    expect(screen.queryByRole('dialog', { name: '插入表格' })).not.toBeInTheDocument()
    expect(view.state.doc.toString()).toContain('| 列 1 | 列 2 | 列 3 | 列 4 | 列 5 | 列 6 | 列 7 | 列 8 |')
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('列 1')
  })

  test('focuses and selects the first table header after insertion', async () => {
    function ControlledEditor() {
      const [value, setValue] = useState('')
      return <MarkdownEditor value={value} onChange={setValue} media={[]} />
    }

    render(<ControlledEditor />)
    fireEvent.click(screen.getByRole('button', { name: '表格' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '插入表格' })).getByRole('button', { name: '插入' }))

    const first = await screen.findByRole('textbox', { name: '第 1 行第 1 列' }) as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(first))
    expect(first).toHaveValue('列 1')
    expect(first.selectionStart).toBe(0)
    expect(first.selectionEnd).toBe(3)
  })

  test('validates table dimensions and restores toolbar focus on cancel', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} media={[]} />)
    const tableButton = screen.getByRole('button', { name: '表格' })
    tableButton.focus()
    fireEvent.click(tableButton)
    const dialog = screen.getByRole('dialog', { name: '插入表格' })
    const columns = within(dialog).getByLabelText('列数')
    const insert = within(dialog).getByRole('button', { name: '插入' })

    fireEvent.change(columns, { target: { value: '' } })
    expect(insert).toBeDisabled()
    fireEvent.change(columns, { target: { value: '9' } })
    expect(insert).toBeDisabled()
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '插入表格' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(tableButton)
  })

  test('disables table insertion with the editor', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} media={[]} disabled />)

    const tableButton = screen.getByRole('button', { name: '表格' })
    expect(tableButton).toBeDisabled()
    fireEvent.click(tableButton)
    expect(screen.queryByRole('dialog', { name: '插入表格' })).not.toBeInTheDocument()
  })

  test('offers italic and task controls and disables them with the editor', () => {
    const { rerender } = render(<MarkdownEditor value="" onChange={vi.fn()} media={[]} />)

    expect(screen.getByRole('button', { name: '斜体' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '任务' })).toBeEnabled()

    rerender(<MarkdownEditor value="" onChange={vi.fn()} media={[]} disabled />)

    expect(screen.getByRole('button', { name: '斜体' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '任务' })).toBeDisabled()
  })

  test('defaults to live formatting and visually wraps without changing Markdown', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="一段很长的 Markdown" onChange={onChange} media={[]} />)

    const source = screen.getByRole('button', { name: '源代码' })
    expect(source).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.cm-lineWrapping')).toBeInTheDocument()

    fireEvent.click(source)

    expect(screen.getByRole('button', { name: '即时排版' })).toHaveAttribute('aria-pressed', 'true')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).toHaveTextContent('一段很长的 Markdown')
  })

  test('keeps the same editor history while switching modes', () => {
    function ControlledEditor() {
      const [value, setValue] = useState('原文')
      return <MarkdownEditor value={value} onChange={setValue} media={[]} />
    }

    render(<ControlledEditor />)
    const textbox = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    const view = EditorView.findFromDOM(textbox)
    if (!view) throw new Error('CodeMirror view not found')

    view.dispatch({ changes: { from: view.state.doc.length, insert: '新增' } })
    fireEvent.click(screen.getByRole('button', { name: '源代码' }))
    fireEvent.click(screen.getByRole('button', { name: '即时排版' }))

    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('原文')
  })

  test('leaves ordinary text paste to CodeMirror', () => {
    const preparePastedImages = vi.fn()
    const onCommitPastedImages = vi.fn()
    render(<MarkdownEditor value="正文" onChange={vi.fn()} media={[]} preparePastedImages={preparePastedImages} onCommitPastedImages={onCommitPastedImages} />)

    const textbox = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    const view = EditorView.findFromDOM(textbox)
    if (!view) throw new Error('CodeMirror view not found')
    view.dispatch({ selection: { anchor: view.state.doc.length } })

    dispatchPaste(textbox, [clipboardItem()], '粘贴')

    expect(view.state.doc.toString()).toBe('正文粘贴')
    expect(preparePastedImages).not.toHaveBeenCalled()
    expect(onCommitPastedImages).not.toHaveBeenCalled()
  })

  test('prepares and commits one clipboard image with the complete next Markdown', async () => {
    const file = new File(['png'], 'image.png', { type: 'image/png' })
    const asset = imageAsset('one', 'image.png')
    const preparePastedImages = vi.fn().mockResolvedValue([asset])
    const onCommitPastedImages = vi.fn()
    render(<MarkdownEditor value="正文" onChange={vi.fn()} media={[]} preparePastedImages={preparePastedImages} onCommitPastedImages={onCommitPastedImages} />)
    const textbox = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    const view = EditorView.findFromDOM(textbox)
    if (!view) throw new Error('CodeMirror view not found')
    view.dispatch({ selection: { anchor: view.state.doc.length } })

    const event = dispatchPaste(textbox, [clipboardItem(file)])

    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(preparePastedImages).toHaveBeenCalledWith({ files: [file], selection: { from: 2, to: 2 }, value: '正文' }))
    await waitFor(() => expect(onCommitPastedImages).toHaveBeenCalledWith([asset], '正文\n\n![image](images/image.png)'))
    expect(onCommitPastedImages).toHaveBeenCalledTimes(1)
  })

  test('preserves clipboard image order and commits the batch once', async () => {
    const firstFile = new File(['one'], 'first.png', { type: 'image/png' })
    const secondFile = new File(['two'], 'second.png', { type: 'image/png' })
    const assets = [imageAsset('one', 'first.png'), imageAsset('two', 'second.png')]
    const preparePastedImages = vi.fn().mockResolvedValue(assets)
    const onCommitPastedImages = vi.fn()
    render(<MarkdownEditor value="" onChange={vi.fn()} media={[]} preparePastedImages={preparePastedImages} onCommitPastedImages={onCommitPastedImages} />)

    dispatchPaste(screen.getByRole('textbox', { name: 'Markdown 编辑器' }), [clipboardItem(firstFile), clipboardItem(secondFile)])

    await waitFor(() => expect(preparePastedImages).toHaveBeenCalledWith(expect.objectContaining({ files: [firstFile, secondFile] })))
    await waitFor(() => expect(onCommitPastedImages).toHaveBeenCalledWith(assets, '![first](images/first.png)\n\n![second](images/second.png)'))
    expect(onCommitPastedImages).toHaveBeenCalledTimes(1)
  })

  test('keeps body and selection unchanged when clipboard image preparation fails', async () => {
    const file = new File(['bad'], 'bad.png', { type: 'image/png' })
    const preparePastedImages = vi.fn().mockRejectedValue(new Error('invalid image'))
    const onCommitPastedImages = vi.fn()
    render(<MarkdownEditor value="正文" onChange={vi.fn()} media={[]} preparePastedImages={preparePastedImages} onCommitPastedImages={onCommitPastedImages} />)
    const textbox = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    const view = EditorView.findFromDOM(textbox)
    if (!view) throw new Error('CodeMirror view not found')
    view.dispatch({ selection: { anchor: 1 } })

    dispatchPaste(textbox, [clipboardItem(file)])

    await waitFor(() => expect(preparePastedImages).toHaveBeenCalled())
    await waitFor(() => expect(document.activeElement).toBe(textbox))
    expect(onCommitPastedImages).not.toHaveBeenCalled()
    expect(view.state.doc.toString()).toBe('正文')
    expect(view.state.selection.main.anchor).toBe(1)
  })
})

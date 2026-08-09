import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { undo } from '@codemirror/commands'
import { EditorView } from '@uiw/react-codemirror'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { MarkdownEditor } from '../../src/editor/MarkdownEditor'

afterEach(cleanup)

describe('MarkdownEditor', () => {
  test('defaults to live formatting and visually wraps without changing Markdown', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="一段很长的 Markdown" onChange={onChange} />)

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
      return <MarkdownEditor value={value} onChange={setValue} />
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
})

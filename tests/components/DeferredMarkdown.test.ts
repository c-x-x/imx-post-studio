import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { afterEach, describe, expect, it } from 'vitest'
import { DeferredMarkdown, editorMarkdown } from '../../src/editor/deferred-markdown'
import { RawMarkdownBlock } from '../../src/editor/markdown-extensions'

let editor: Editor
afterEach(() => editor?.destroy())

function setup(content = '') {
  editor = new Editor({
    extensions: [StarterKit, Markdown, RawMarkdownBlock, DeferredMarkdown],
    content, contentType: 'markdown', enableInputRules: ['codeBlock', 'horizontalRule'],
  })
  return editor
}

describe('deferred Markdown input', () => {
  it('keeps typed heading markers until Enter, without escaping the saved source', () => {
    setup().commands.insertContent({ type: 'text', text: '## 中文标题' })
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(editorMarkdown(editor)).toBe('## 中文标题')
    expect(editor.view.dom.querySelector('.editor-markdown-marker')).toHaveTextContent('##')
    editor.commands.splitBlock()
    expect(editor.state.doc.firstChild?.type.name).toBe('heading')
    expect(editor.state.doc.firstChild?.attrs.level).toBe(2)
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(editor.state.doc.firstChild?.textContent).toBe('中文标题')
  })

  it('commits bold, italic and strike together when moving to another paragraph', () => {
    setup('正文\n\n下一段')
    editor.commands.setTextSelection(3)
    editor.commands.insertContent({ type: 'text', text: ' **粗体** *斜体* ~~删除~~' })
    expect(editor.view.dom.querySelector('strong')).toBeNull()
    expect(editorMarkdown(editor)).toContain('**粗体** *斜体* ~~删除~~')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('粗体')
    expect(editor.view.dom.querySelector('em')).toHaveTextContent('斜体')
    expect(editor.view.dom.querySelector('s')).toHaveTextContent('删除')
    expect(editor.state.selection.$from.parent.textContent).toBe('下一段')
    expect(editorMarkdown(editor)).not.toContain('\\*')
  })

  it('leaves code and escaped syntax literal and preserves existing marks', () => {
    setup('**已有粗体** 普通文字')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.unsetAllMarks()
    editor.commands.insertContent({ type: 'text', text: ' *斜体* \\*原样\\*' })
    editor.commands.splitBlock()
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('已有粗体')
    expect(editor.view.dom.querySelector('em')).toHaveTextContent('斜体')
    expect(editor.view.dom.textContent).toContain('*原样*')
    editor.commands.setCodeBlock()
    editor.commands.insertContent({ type: 'text', text: '**not bold**' })
    editor.commands.exitCode()
    expect(editor.view.dom.querySelector('pre')).toHaveTextContent('**not bold**')
  })

  it('keeps toolbar headings immediate and permits undoing a committed line', () => {
    setup().commands.toggleHeading({ level: 2 })
    expect(editor.isActive('heading', { level: 2 })).toBe(true)
    editor.commands.setParagraph()
    editor.commands.insertContent({ type: 'text', text: '~~撤销测试~~' })
    editor.commands.splitBlock()
    expect(editor.view.dom.querySelector('s')).toHaveTextContent('撤销测试')
    expect(editor.commands.undo()).toBe(true)
    expect(editor.commands.redo()).toBe(true)
    expect(editor.view.dom.querySelector('s')).toHaveTextContent('撤销测试')
  })

  it('does not replace the composing paragraph or move its caret during IME input', () => {
    setup().commands.insertContent({ type: 'text', text: '## ' })
    editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    editor.commands.insertContent({ type: 'text', text: '中文输入' })
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(editor.state.selection.$from.parentOffset).toBe('## 中文输入'.length)
    editor.view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文输入' }))
    expect(editorMarkdown(editor)).toBe('## 中文输入')
    expect(editor.state.selection.$from.parentOffset).toBe('## 中文输入'.length)
  })

  it('does not reinterpret escaped literal markers loaded from source mode', () => {
    setup().commands.insertContent({ type: 'text', text: '**尚未提交**' })
    editor.commands.setContent('\\*原样星号\\*', { contentType: 'markdown', emitUpdate: false })
    expect(editorMarkdown(editor)).toBe('\\*原样星号\\*')
    editor.commands.splitBlock()
    expect(editor.view.dom.querySelector('em')).toBeNull()
  })
})

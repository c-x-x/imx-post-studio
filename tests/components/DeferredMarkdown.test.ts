import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TextSelection } from '@tiptap/pm/state'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { afterEach, describe, expect, it } from 'vitest'
import { DeferredMarkdown, editorMarkdown, pauseDeferredMarkdown, toolbarMarkdownMarkersKey } from '../../src/editor/deferred-markdown'
import { MathInline, RawMarkdownBlock, RawMarkdownInline, Subscript, Superscript, TextHighlight } from '../../src/editor/markdown-extensions'

let editor: Editor
afterEach(() => editor?.destroy())

function setup(content = '') {
  editor = new Editor({
    extensions: [StarterKit, TaskList, TaskItem, MathInline, TextHighlight, Subscript, Superscript, Markdown, RawMarkdownBlock, RawMarkdownInline, DeferredMarkdown],
    content, contentType: 'markdown', enableInputRules: ['codeBlock', 'horizontalRule'],
  })
  return editor
}

describe('deferred Markdown input', () => {
  it('keeps the selected text while opening formatting controls', () => {
    setup().commands.insertContent({ type: 'text', text: '**粗体** 链接 尾部' })
    editor.commands.setTextSelection({ from: 8, to: 10 })
    const control = document.createElement('button')
    control.setAttribute('data-editor-controls', '')
    editor.view.dom.dispatchEvent(new FocusEvent('blur', { relatedTarget: control }))
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('链接')
    editor.commands.toggleItalic()
    expect(editor.view.dom.querySelector('em')).toHaveTextContent('链接')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.view.dom.dispatchEvent(new FocusEvent('blur'))
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('粗体')
    expect(editor.view.dom.querySelector('em')).toHaveTextContent('链接')
  })

  it('can finish incomplete syntax after leaving and returning to the editor', () => {
    setup().commands.insertContent({ type: 'text', text: '**尚未完成' })
    editor.view.dom.dispatchEvent(new FocusEvent('blur'))
    editor.view.dom.dispatchEvent(new FocusEvent('focus'))
    editor.commands.insertContent({ type: 'text', text: '**' })
    editor.commands.splitBlock()
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('尚未完成')
  })

  it('keeps four typed asterisks as an empty bold source when leaving the line', () => {
    setup().commands.insertContent({ type: 'text', text: '****' })
    editor.commands.splitBlock()

    expect(editor.view.dom.querySelector('hr')).toBeNull()
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(editor.state.doc.firstChild?.textContent).toBe('****')
    expect(editorMarkdown(editor).trim()).toBe('****')
  })

  it('renders typed bold on Enter and starts the next paragraph without inline toolbar styles', () => {
    setup().commands.insertContent({ type: 'text', text: '**Markdown 加粗**' })
    editor.commands.splitBlock()
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('Markdown 加粗')
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(editor.isActive('bold')).toBe(false)

    editor.commands.toggleBold()
    editor.commands.toggleItalic()
    editor.commands.toggleStrike()
    editor.commands.insertContent({ type: 'text', text: '工具栏样式' })
    expect(editor.isActive('bold')).toBe(true)
    expect(editor.isActive('italic')).toBe(true)
    expect(editor.isActive('strike')).toBe(true)
    const handled = editor.view.someProp('handleKeyDown', (handler) => handler(
      editor.view,
      new KeyboardEvent('keydown', { key: 'Enter' }),
    ))
    expect(handled).toBe(true)
    expect(editor.isActive('bold')).toBe(false)
    expect(editor.isActive('italic')).toBe(false)
    expect(editor.isActive('strike')).toBe(false)
    editor.commands.insertContent({ type: 'text', text: '普通下一行' })
    expect(editor.view.dom.querySelectorAll('strong')).toHaveLength(2)
    expect(editor.view.dom.querySelectorAll('strong')[1]).toHaveTextContent('工具栏样式')
    expect(editor.view.dom.querySelector('em')).toHaveTextContent('工具栏样式')
    expect(editor.view.dom.querySelector('s')).toHaveTextContent('工具栏样式')
    expect(editor.state.selection.$from.parent.textContent).toBe('普通下一行')
  })

  it('reveals inline source but keeps headings rendered when the caret enters', async () => {
    setup('**123**\n\n### 标题')
    editor.commands.setTextSelection(4)
    expect(editor.state.doc.firstChild?.textContent).toBe('**123**')
    expect(editor.state.selection.$from.parentOffset).toBe('**123**'.length)
    expect(editor.view.dom.querySelector('strong')).toBeNull()
    expect(editor.isActive('bold')).toBe(false)
    expect(editor.view.dom.querySelectorAll('.editor-markdown-marker')).toHaveLength(2)

    let headingPosition = 0
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'heading') headingPosition = position
    })
    editor.commands.setTextSelection(headingPosition + 2)
    await Promise.resolve()
    expect(editor.view.dom.querySelector('h3')).toHaveTextContent('标题')
    expect(editor.isActive('heading', { level: 3 })).toBe(true)
    expect(editor.view.dom.querySelector('.editor-markdown-marker')).toBeNull()
  })

  it('continues lists on Enter without carrying inline toolbar styles', () => {
    setup()
    editor.chain().toggleBulletList().toggleBold().toggleItalic().insertContent('带样式列表项').run()
    const handled = editor.view.someProp('handleKeyDown', (handler) => handler(
      editor.view,
      new KeyboardEvent('keydown', { key: 'Enter' }),
    ))
    expect(handled).toBe(true)
    expect(editor.state.selection.$from.node(-1).type.name).toBe('listItem')
    expect(editor.isActive('bold')).toBe(false)
    expect(editor.isActive('italic')).toBe(false)
    editor.commands.insertContent('下一项')
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('带样式列表项')
    expect(editor.view.dom.querySelector('em')).toHaveTextContent('带样式列表项')
    expect(editor.state.selection.$from.parent.textContent).toBe('下一项')
  })

  it('preserves existing literal Markdown while parsing new syntax in the same paragraph', () => {
    setup('\\*原样星号\\* \\~\\~原样删除线\\~\\~')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.insertContent({ type: 'text', text: ' **新增加粗**' })
    const saved = editorMarkdown(editor)
    editor.commands.splitBlock()
    expect(editor.view.dom.querySelector('em, s')).toBeNull()
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('新增加粗')
    expect(editor.view.dom.textContent).toContain('*原样星号* ~~原样删除线~~')
    editor.commands.setContent(saved, { contentType: 'markdown', emitUpdate: false })
    expect(editor.view.dom.querySelector('em, s')).toBeNull()
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('新增加粗')
  })

  it('does not move the link target when a dialog blurs pending Markdown', () => {
    setup().commands.insertContent({ type: 'text', text: '**粗体** 链接 尾部' })
    editor.commands.setTextSelection({ from: 8, to: 10 })
    pauseDeferredMarkdown(editor, true)
    editor.view.dom.dispatchEvent(new FocusEvent('blur'))
    expect(editor.state.doc.textBetween(8, 10)).toBe('链接')
    editor.chain().setTextSelection({ from: 8, to: 10 }).setLink({ href: 'https://example.com' }).run()
    pauseDeferredMarkdown(editor, false)
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('粗体')
    expect(editor.view.dom.querySelector('a')).toHaveTextContent('链接')
    expect(editor.view.dom.textContent).toContain('尾部')
  })

  it.each([
    ['- 列表项', 'bulletList', 'listItem'],
    ['1. 列表项', 'orderedList', 'listItem'],
    ['- [ ] 待办', 'taskList', 'taskItem'],
    ['> 引用', 'blockquote', 'blockquote'],
  ])('continues %s with native Enter behavior', (source, container, parent) => {
    setup().commands.insertContent({ type: 'text', text: source })
    editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, new KeyboardEvent('keydown', { key: 'Enter' })))
    expect(editor.state.doc.firstChild?.type.name).toBe(container)
    expect(editor.state.selection.$from.node(-1).type.name).toBe(parent)
    expect(editor.state.selection.$from.parent.textContent).toBe('')
    editor.commands.insertContent({ type: 'text', text: '继续写' })
    expect(editor.state.doc.firstChild?.textContent).toContain('继续写')
    expect(editor.commands.undo()).toBe(true)
    expect(editor.commands.redo()).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toContain('继续写')
  })

  it('recognizes typed inline syntax inside inherited formatting', () => {
    setup('**已有加粗**')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.view.dispatch(editor.state.tr.insertText(' *继续斜体* ~~删除~~'))
    editor.commands.splitBlock()
    expect(editor.view.dom.querySelector('em')).toHaveTextContent('继续斜体')
    expect(editor.view.dom.querySelector('s')).toHaveTextContent('删除')
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('已有加粗')
  })

  it('recognizes directly typed inline math when leaving the paragraph', () => {
    setup().commands.insertContent({ type: 'text', text: '能量 $E=mc^2$' })
    expect(editorMarkdown(editor)).toBe('能量 $E=mc^2$')
    editor.commands.splitBlock()
    expect(editor.state.doc.firstChild?.child(1).type.name).toBe('mathInline')
    expect(editor.getMarkdown()).toContain('$E=mc^2$')
  })

  it('recognizes safe semantic text-style tags when leaving the paragraph', () => {
    setup().commands.insertContent({ type: 'text', text: '**前一段**' })
    editor.commands.splitBlock()
    const from = editor.state.selection.from
    const transaction = editor.state.tr.insertText('<mark></mark>', from)
    transaction.setSelection(TextSelection.create(transaction.doc, from + 6))
    transaction.setMeta(toolbarMarkdownMarkersKey, [
      { from, to: from + 6 },
      { from: from + 6, to: from + 13 },
    ])
    editor.view.dispatch(transaction)
    editor.commands.insertContent({ type: 'text', text: '高亮' })
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(editor.view.dom.querySelector('mark')).toHaveTextContent('高亮')
  })

  it('commits a complete line when focus leaves the editor', () => {
    setup().commands.insertContent({ type: 'text', text: '**粗体** *斜体*' })
    editor.view.dom.dispatchEvent(new FocusEvent('blur'))
    expect(editor.view.dom.querySelector('strong')).toHaveTextContent('粗体')
    expect(editor.view.dom.querySelector('em')).toHaveTextContent('斜体')
  })

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

  it('keeps toolbar headings rendered and permits undoing a committed line', () => {
    setup().commands.toggleHeading({ level: 2 })
    expect(editor.state.doc.firstChild?.type.name).toBe('heading')
    expect(editor.isActive('heading', { level: 2 })).toBe(true)
    expect(editor.view.dom.querySelector('.editor-markdown-marker')).toBeNull()
    editor.commands.insertContent('标题')
    editor.commands.splitBlock()
    expect(editor.state.doc.firstChild?.type.name).toBe('heading')
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

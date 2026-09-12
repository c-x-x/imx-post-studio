import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { common, createLowlight } from 'lowlight'
import { TextSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it } from 'vitest'
import { CalloutBlock, FootnoteDefinition, FootnoteReference, MathBlock, MathInline, MermaidBlock, RawMarkdownBlock, RawMarkdownInline, SafeCodeBlock, SafeTable, SpecialBlockInput, Subscript, Superscript, TextHighlight } from '../../src/editor/markdown-extensions'

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function createEditor(markdown: string) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      SafeCodeBlock.configure({ lowlight: createLowlight(common) }),
      SafeTable.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: true, allowBase64: false }),
      TextHighlight,
      Subscript,
      Superscript,
      MathBlock,
      MathInline,
      CalloutBlock,
      MermaidBlock,
      FootnoteReference,
      FootnoteDefinition,
      RawMarkdownBlock,
      RawMarkdownInline,
      Markdown,
      SpecialBlockInput,
    ],
    content: markdown,
    contentType: 'markdown',
  })
  editors.push(editor)
  return editor
}

describe('current rich Markdown contract', () => {
  it('preserves Hugo shortcodes, raw HTML, comments and footnotes after editing', () => {
    const source = [
      '正文',
      '',
      '<!--more-->',
      '',
      '{{< figure src="images/a.jpg" >}}',
      '',
      '<details><summary>标题</summary>内容</details>',
      '',
      '脚注[^note]',
      '',
      '[^note]: 脚注内容',
    ].join('\n')
    const editor = createEditor(source)
    editor.commands.insertContentAt(3, '补充')
    const output = editor.getMarkdown()
    expect(output).toContain('<!--more-->')
    expect(output).toContain('{{< figure src="images/a.jpg" >}}')
    expect(output).toContain('<details><summary>标题</summary>内容</details>')
    expect(output).toContain('脚注[^note]')
    expect(output).toContain('[^note]: 脚注内容')
  })

  it('escapes literal pipes in table cells', () => {
    const editor = createEditor('| 名称 | 状态 |\n| --- | --- |\n| A\\|B | 正常 |')
    expect(editor.getMarkdown()).toContain('A\\|B')
  })

  it('uses a longer fence when a code block contains triple backticks', () => {
    const editor = createEditor('````md\n```js\ncode\n```\n````')
    expect(editor.getMarkdown()).toContain('````md\n```js\ncode\n```\n````')
  })

  it('round-trips formulas, Mermaid, callouts and semantic text marks', () => {
    const source = [
      '<mark>重点</mark> H<sub>2</sub>O x<sup>2</sup> $a^2+b^2=c^2$',
      '',
      '$$',
      '\\frac{1}{2}',
      '$$',
      '',
      '> [!WARNING]',
      '> 请先备份。',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
    ].join('\n')
    const output = createEditor(source).getMarkdown()
    expect(output).toContain('<mark>重点</mark>')
    expect(output).toContain('H<sub>2</sub>O')
    expect(output).toContain('x<sup>2</sup>')
    expect(output).toContain('$a^2+b^2=c^2$')
    expect(output).toContain('$$\n\\frac{1}{2}\n$$')
    expect(output).toContain('> [!WARNING]\n> 请先备份。')
    expect(output).toContain('```mermaid\ngraph TD\n  A --> B\n```')
  })

  it('parses footnotes as editable source-backed nodes and preserves their Markdown', () => {
    const editor = createEditor('正文[^1]\n\n[^1]: 在此输入描述')
    expect(editor.state.doc.firstChild?.child(1).type.name).toBe('footnoteReference')
    expect(editor.state.doc.lastChild?.type.name).toBe('footnoteDefinition')
    expect(editor.getMarkdown()).toBe('正文[^1]\n\n[^1]: 在此输入描述')
  })

  it('turns an incomplete footnote definition back into ordinary text without deleting it', () => {
    const editor = createEditor('正文[^1]\n\n[^1]: 注解')
    let definitionPosition = -1
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'footnoteDefinition') definitionPosition = position
    })
    const definition = editor.state.doc.nodeAt(definitionPosition)
    const colon = definition?.textContent.indexOf(':') ?? -1
    editor.view.dispatch(editor.state.tr.delete(definitionPosition + 1 + colon, definitionPosition + 2 + colon))
    expect(editor.state.doc.nodeAt(definitionPosition)?.type.name).toBe('paragraph')
    expect(editor.state.doc.nodeAt(definitionPosition)?.textContent).toBe('[^1] 注解')
    expect(editor.state.doc.firstChild?.child(1).type.name).toBe('footnoteReference')
  })

  it('deletes a footnote reference with one Backspace from the adjacent cursor', () => {
    const editor = createEditor('正文[^1]\n\n[^1]: 注解')
    let referenceEnd = -1
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'footnoteReference') referenceEnd = position + node.nodeSize
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, referenceEnd)))
    expect(editor.commands.keyboardShortcut('Backspace')).toBe(true)
    expect(editor.getMarkdown()).not.toContain('正文[^1]')
    expect(editor.getMarkdown()).toContain('[^1]: 注解')
  })

  it('keeps core block transformations available with extended syntax enabled', () => {
    const editor = createEditor('')
    expect(editor.commands.setHeading({ level: 2 })).toBe(true)
    expect(editor.isActive('heading', { level: 2 })).toBe(true)
    expect(editor.commands.setParagraph()).toBe(true)
    expect(editor.commands.toggleCodeBlock()).toBe(true)
    expect(editor.isActive('codeBlock')).toBe(true)
    expect(editor.commands.toggleCodeBlock()).toBe(true)
    expect(editor.can().toggleBold()).toBe(true)
  })

  it.each([
    [['$$', 'E=mc^2', '$$'], 'mathBlock', '$$\nE=mc^2\n$$'],
    [['```mermaid', 'flowchart TD', '```'], 'mermaidBlock', '```mermaid\nflowchart TD\n```'],
  ])('turns a newly completed typed fence into an editable %s node', (lines, nodeName, markdown) => {
    const editor = createEditor('')
    editor.commands.setContent({
      type: 'doc',
      content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
    })
    expect(editor.state.doc.firstChild?.type.name).toBe(nodeName)
    expect(editor.getMarkdown()).toContain(markdown)
  })
})

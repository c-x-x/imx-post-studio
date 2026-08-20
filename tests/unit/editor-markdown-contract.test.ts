import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { common, createLowlight } from 'lowlight'
import { afterEach, describe, expect, it } from 'vitest'
import { RawMarkdownBlock, RawMarkdownInline, SafeCodeBlock, SafeTable } from '../../src/editor/markdown-extensions'

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
      RawMarkdownBlock,
      RawMarkdownInline,
      Markdown,
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
})

import { forwardRef, useImperativeHandle, useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { runMarkdownCommand, type MarkdownCommand } from './markdown-commands'
import './editor.css'

export interface MarkdownEditorHandle {
  insertImage(name: string, alt: string): void
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
}

const toolbar: Array<{ label: string; command: Exclude<MarkdownCommand, { type: 'image' }> }> = [
  { label: '加粗', command: { type: 'bold' } },
  { label: '标题', command: { type: 'heading' } },
  { label: '列表', command: { type: 'list' } },
  { label: '引用', command: { type: 'quote' } },
  { label: '代码', command: { type: 'code' } },
  { label: '链接', command: { type: 'link' } },
]

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({ value, onChange }, ref) {
  const editorRef = useRef<ReactCodeMirrorRef>(null)

  const applyCommand = (command: MarkdownCommand) => {
    const view = editorRef.current?.view
    if (!view) return
    const selection = view.state.selection.main
    const edit = runMarkdownCommand(view.state.doc.toString(), { from: selection.from, to: selection.to }, command)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: edit.value },
      selection: { anchor: edit.selection.from, head: edit.selection.to },
    })
    onChange(edit.value)
    view.focus()
  }

  useImperativeHandle(ref, () => ({
    insertImage(name: string, alt: string) {
      applyCommand({ type: 'image', name, alt })
    },
  }))

  return <section className="markdown-editor" aria-label="Markdown 编辑">
    <div className="editor-toolbar" role="toolbar" aria-label="Markdown 格式">
      {toolbar.map(({ label, command }) => <button key={label} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand(command)}>{label}</button>)}
    </div>
    <CodeMirror ref={editorRef} value={value} height="min(65vh, 760px)" extensions={[markdown()]} onChange={onChange} aria-label="Markdown 编辑器" placeholder="从这里开始写 Markdown…" />
  </section>
})

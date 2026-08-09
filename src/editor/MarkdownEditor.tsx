import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import type { EditorMode } from './editor-mode'
import { runMarkdownCommand, type MarkdownCommand } from './markdown-commands'
import './editor.css'

export interface MarkdownEditorHandle {
  insertImage(name: string, alt: string): void
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const toolbar: Array<{ label: string; command: Exclude<MarkdownCommand, { type: 'image' }> }> = [
  { label: '加粗', command: { type: 'bold' } },
  { label: '标题', command: { type: 'heading' } },
  { label: '列表', command: { type: 'list' } },
  { label: '引用', command: { type: 'quote' } },
  { label: '代码', command: { type: 'code' } },
  { label: '链接', command: { type: 'link' } },
]

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({ value, onChange, disabled = false }, ref) {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const [mode, setMode] = useState<EditorMode>('rich')

  const applyCommand = (command: MarkdownCommand) => {
    if (disabled) return
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

  return <section className="markdown-editor" data-mode={mode} aria-label="Markdown 编辑">
    <div className="editor-toolbar" role="toolbar" aria-label="Markdown 格式">
      {toolbar.map(({ label, command }) => <button key={label} type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand(command)}>{label}</button>)}
      <span className="editor-toolbar-spacer" aria-hidden="true" />
      <button
        className="editor-mode-toggle"
        type="button"
        aria-pressed={mode === 'source'}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setMode((current) => current === 'rich' ? 'source' : 'rich')}
      >
        {mode === 'rich' ? '源代码' : '即时排版'}
      </button>
    </div>
    <CodeMirror ref={editorRef} value={value} height="calc(100dvh - 190px)" extensions={[markdown(), EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器' })]} editable={!disabled} onChange={onChange} placeholder="从这里开始写 Markdown…" />
  </section>
})

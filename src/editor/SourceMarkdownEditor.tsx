import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'

export interface SourceMarkdownEditorHandle {
  focusPosition(position: number): void
}

interface SourceMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}

export const SourceMarkdownEditor = forwardRef<SourceMarkdownEditorHandle, SourceMarkdownEditorProps>(function SourceMarkdownEditor({ value, onChange, disabled }, ref) {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const extensions = useMemo(() => [
    markdown({ codeLanguages: languages }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器' }),
  ], [])

  useImperativeHandle(ref, () => ({
    focusPosition(position: number) {
      const view = editorRef.current?.view
      if (!view) return
      const anchor = Math.max(0, Math.min(view.state.doc.length, position))
      view.dispatch({ selection: { anchor }, scrollIntoView: true })
      view.focus()
    },
  }), [])

  return <CodeMirror ref={editorRef} value={value} height="calc(100dvh - 190px)" extensions={extensions} editable={!disabled} onChange={onChange} placeholder="从这里开始写 Markdown…" />
})

export default SourceMarkdownEditor

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { GFM } from '@lezer/markdown'
import type { MediaAsset } from '../metadata/article'
import { clipboardImages, pastedImageMarkdown, type PastedImageRequest } from './paste'

export interface SourceMarkdownEditorHandle {
  focusPosition(position: number): void
  insertMarkdown(markdown: string): void
}

interface SourceMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  preparePastedImages?: (request: PastedImageRequest) => Promise<MediaAsset[]>
  onCommitPastedImages?: (assets: MediaAsset[], body: string) => void
}

export const SourceMarkdownEditor = forwardRef<SourceMarkdownEditorHandle, SourceMarkdownEditorProps>(function SourceMarkdownEditor({ value, onChange, disabled, preparePastedImages, onCommitPastedImages }, ref) {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const prepareRef = useRef(preparePastedImages)
  const commitRef = useRef(onCommitPastedImages)
  prepareRef.current = preparePastedImages
  commitRef.current = onCommitPastedImages
  const extensions = useMemo(() => [
    markdown({ codeLanguages: languages, extensions: GFM }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器' }),
    EditorView.domEventHandlers({
      paste(event, view) {
        const files = clipboardImages(event.clipboardData)
        const prepare = prepareRef.current
        const commit = commitRef.current
        if (files.length === 0 || !prepare || !commit) return false
        event.preventDefault()
        const selection = view.state.selection.main
        const current = view.state.doc.toString()
        void prepare({ files, selection: { from: selection.from, to: selection.to }, value: current })
          .then((assets) => {
            if (assets.length === 0) return
            const insert = pastedImageMarkdown(assets)
            view.dispatch({ changes: { from: selection.from, to: selection.to, insert }, selection: { anchor: selection.from + insert.length }, scrollIntoView: true })
            commit(assets, view.state.doc.toString())
          })
          .catch(() => undefined)
        return true
      },
    }),
  ], [])

  useImperativeHandle(ref, () => ({
    focusPosition(position: number) {
      const view = editorRef.current?.view
      if (!view) return
      const anchor = Math.max(0, Math.min(view.state.doc.length, position))
      view.dispatch({ selection: { anchor }, scrollIntoView: true })
      view.focus()
    },
    insertMarkdown(source: string) {
      const view = editorRef.current?.view
      if (!view) return
      const selection = view.state.selection.main
      view.dispatch({ changes: { from: selection.from, to: selection.to, insert: source }, selection: { anchor: selection.from + source.length }, scrollIntoView: true })
      view.focus()
    },
  }), [])

  return <CodeMirror ref={editorRef} value={value} height="100%" extensions={extensions} editable={!disabled} onChange={onChange} placeholder="从这里开始写 Markdown…" />
})

export default SourceMarkdownEditor

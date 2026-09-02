import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { redo as redoCommand, redoDepth, undo as undoCommand, undoDepth } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { GFM } from '@lezer/markdown'
import type { MediaAsset } from '../metadata/article'
import { clipboardImages, pastedImageMarkdown, type PastedImageRequest } from './paste'

export interface SourceMarkdownEditorHandle {
  focusPosition(position: number): void
  insertMarkdown(markdown: string): void
  redo(): boolean
  undo(): boolean
}

interface SourceMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  onHistoryStateChange?: (state: { canUndo: boolean, canRedo: boolean }) => void
  preparePastedImages?: (request: PastedImageRequest) => Promise<MediaAsset[]>
  onCommitPastedImages?: (assets: MediaAsset[], body: string) => void
}

export const SourceMarkdownEditor = forwardRef<SourceMarkdownEditorHandle, SourceMarkdownEditorProps>(function SourceMarkdownEditor({ value, onChange, disabled, onHistoryStateChange, preparePastedImages, onCommitPastedImages }, ref) {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const prepareRef = useRef(preparePastedImages)
  const commitRef = useRef(onCommitPastedImages)
  const historyRef = useRef(onHistoryStateChange)
  const mountedRef = useRef(true)
  prepareRef.current = preparePastedImages
  commitRef.current = onCommitPastedImages
  historyRef.current = onHistoryStateChange
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const extensions = useMemo(() => [
    markdown({ codeLanguages: languages, extensions: GFM }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器' }),
    EditorView.updateListener.of((update) => {
      historyRef.current?.({ canUndo: undoDepth(update.state) > 0, canRedo: redoDepth(update.state) > 0 })
    }),
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
            if (assets.length === 0 || !mountedRef.current) return
            const insert = pastedImageMarkdown(assets)
            const target = view.state.doc.toString() === current ? selection : view.state.selection.main
            view.dispatch({ changes: { from: target.from, to: target.to, insert }, selection: { anchor: target.from + insert.length }, scrollIntoView: true })
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
    redo() {
      const view = editorRef.current?.view
      return view ? redoCommand(view) : false
    },
    undo() {
      const view = editorRef.current?.view
      return view ? undoCommand(view) : false
    },
  }), [])

  return <CodeMirror autoFocus className="source-markdown-editor" ref={editorRef} value={value} height="100%" extensions={extensions} editable={!disabled} onChange={onChange} placeholder="从这里开始写 Markdown…" />
})

export default SourceMarkdownEditor

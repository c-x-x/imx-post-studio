import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { Annotation } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import type { ViewUpdate } from '@codemirror/view'
import type { MediaAsset } from '../metadata/article'
import { mediaAlt } from '../media/names'
import type { EditorMode } from './editor-mode'
import { liveMarkdown } from './live-markdown'
import { insertMarkdownImages, runMarkdownCommand, type MarkdownCommand, type MarkdownSelection } from './markdown-commands'
import './editor.css'

export interface MarkdownEditorHandle {
  insertImage(name: string, alt: string): void
}

export interface PastedImageRequest {
  files: File[]
  selection: MarkdownSelection
  value: string
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  media: MediaAsset[]
  preparePastedImages?: (request: PastedImageRequest) => Promise<MediaAsset[]>
  onCommitPastedImages?: (assets: MediaAsset[], body: string) => void
  resolveMediaUrl?: (asset: MediaAsset) => string
  disabled?: boolean
}

const pastedImageTransaction = Annotation.define<boolean>()
const markdownLanguage = markdown({ extensions: GFM })
const markdownAccessibility = EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器' })

const toolbar: Array<{ label: string; command: Exclude<MarkdownCommand, { type: 'image' }> }> = [
  { label: '加粗', command: { type: 'bold' } },
  { label: '斜体', command: { type: 'italic' } },
  { label: '标题', command: { type: 'heading' } },
  { label: '列表', command: { type: 'list' } },
  { label: '任务', command: { type: 'task' } },
  { label: '引用', command: { type: 'quote' } },
  { label: '代码', command: { type: 'code' } },
  { label: '链接', command: { type: 'link' } },
]

function clipboardImages(data: DataTransfer | null): File[] {
  if (!data) return []
  const itemFiles = Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  return itemFiles.length > 0
    ? itemFiles
    : Array.from(data.files ?? []).filter((file) => file.type.startsWith('image/'))
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({
  value,
  onChange,
  media,
  preparePastedImages,
  onCommitPastedImages,
  resolveMediaUrl,
  disabled = false,
}, ref) {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const [mode, setMode] = useState<EditorMode>('rich')
  const pastePending = useRef(false)
  const disabledRef = useRef(disabled)
  const onChangeRef = useRef(onChange)
  const preparePastedImagesRef = useRef(preparePastedImages)
  const onCommitPastedImagesRef = useRef(onCommitPastedImages)
  useLayoutEffect(() => {
    disabledRef.current = disabled
    onChangeRef.current = onChange
    preparePastedImagesRef.current = preparePastedImages
    onCommitPastedImagesRef.current = onCommitPastedImages
  }, [disabled, onChange, onCommitPastedImages, preparePastedImages])
  const bodyMediaKey = media.filter((asset) => asset.kind === 'body').map((asset) => `${asset.id}:${asset.name}`).join('\u0000')
  // The reducer clones unchanged media wrappers while typing. Asset identity is
  // the stable id/name pair, so avoid reconfiguring CodeMirror for those clones.
  const liveImages = useMemo(
    () => new Map(media
      .filter((asset) => asset.kind === 'body' && resolveMediaUrl)
      .map((asset) => [asset.name, { alt: mediaAlt(asset.name), name: asset.name, url: resolveMediaUrl!(asset) }])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bodyMediaKey, resolveMediaUrl],
  )
  const liveMarkdownExtension = useMemo(
    () => liveMarkdown({ mode, images: liveImages, disabled }),
    [disabled, liveImages, mode],
  )
  const pasteHandler = useMemo(() => EditorView.domEventHandlers({
    paste(event, view) {
      const files = clipboardImages(event.clipboardData)
      const prepare = preparePastedImagesRef.current
      const commit = onCommitPastedImagesRef.current
      if (files.length === 0 || disabledRef.current || pastePending.current || !prepare || !commit) return false

      event.preventDefault()
      const currentSelection = view.state.selection.main
      const request: PastedImageRequest = {
        files,
        selection: { from: currentSelection.from, to: currentSelection.to },
        value: view.state.doc.toString(),
      }
      pastePending.current = true
      void prepare(request)
        .then((assets) => {
          if (assets.length === 0 || !view.dom.isConnected) return
          const selection = view.state.selection.main
          if (view.state.doc.toString() !== request.value || selection.from !== request.selection.from || selection.to !== request.selection.to) return
          const edit = insertMarkdownImages(request.value, request.selection, assets.map((asset) => ({ alt: mediaAlt(asset.name), name: asset.name })))
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: edit.value },
            selection: { anchor: edit.selection.from, head: edit.selection.to },
            annotations: pastedImageTransaction.of(true),
          })
          commit(assets, edit.value)
        })
        .catch(() => undefined)
        .finally(() => {
          pastePending.current = false
          if (view.dom.isConnected) view.focus()
        })
      return true
    },
  }), [])
  const extensions = useMemo(() => [
    markdownLanguage,
    liveMarkdownExtension,
    pasteHandler,
    EditorView.lineWrapping,
    markdownAccessibility,
  ], [liveMarkdownExtension, pasteHandler])
  const handleChange = useCallback((next: string, update: ViewUpdate) => {
    if (update.transactions.some((transaction) => transaction.annotation(pastedImageTransaction))) return
    onChangeRef.current(next)
  }, [])

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
    <CodeMirror ref={editorRef} value={value} height="calc(100dvh - 190px)" extensions={extensions} editable={!disabled} onChange={handleChange} placeholder="从这里开始写 Markdown…" />
  </section>
})

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { Annotation } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
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

const toolbar: Array<{ label: string; command: Exclude<MarkdownCommand, { type: 'image' }> }> = [
  { label: '加粗', command: { type: 'bold' } },
  { label: '标题', command: { type: 'heading' } },
  { label: '列表', command: { type: 'list' } },
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
  const liveImages = useMemo(() => new Map(media
    .filter((asset) => asset.kind === 'body' && resolveMediaUrl)
    .map((asset) => [asset.name, { alt: mediaAlt(asset.name), name: asset.name, url: resolveMediaUrl!(asset) }])), [media, resolveMediaUrl])
  const pasteHandler = useMemo(() => EditorView.domEventHandlers({
    paste(event, view) {
      const files = clipboardImages(event.clipboardData)
      if (files.length === 0 || disabled || pastePending.current || !preparePastedImages || !onCommitPastedImages) return false

      event.preventDefault()
      const currentSelection = view.state.selection.main
      const request: PastedImageRequest = {
        files,
        selection: { from: currentSelection.from, to: currentSelection.to },
        value: view.state.doc.toString(),
      }
      pastePending.current = true
      void preparePastedImages(request)
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
          onCommitPastedImages(assets, edit.value)
        })
        .catch(() => undefined)
        .finally(() => {
          pastePending.current = false
          if (view.dom.isConnected) view.focus()
        })
      return true
    },
  }), [disabled, onCommitPastedImages, preparePastedImages])

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
    <CodeMirror ref={editorRef} value={value} height="calc(100dvh - 190px)" extensions={[markdown({ extensions: GFM }), liveMarkdown({ mode, images: liveImages }), pasteHandler, EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器' })]} editable={!disabled} onChange={(next, update) => {
      if (update.transactions.some((transaction) => transaction.annotation(pastedImageTransaction))) return
      onChange(next)
    }} placeholder="从这里开始写 Markdown…" />
  </section>
})

import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Markdown } from '@tiptap/markdown'
import { TableKit } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { common, createLowlight } from 'lowlight'
import type { MediaAsset } from '../metadata/article'
import { mediaAlt } from '../media/names'
import type { EditorMode } from './editor-mode'
import type { MarkdownSelection, MarkdownTableDimensions } from './markdown-commands'
import { TableDialog } from './TableDialog'
import type { SourceMarkdownEditorHandle } from './SourceMarkdownEditor'
import './editor.css'

const SourceMarkdownEditor = lazy(() => import('./SourceMarkdownEditor'))
const lowlight = createLowlight(common)

export interface MarkdownEditorHandle {
  focusPosition(position: number): void
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
  status?: string
  preparePastedImages?: (request: PastedImageRequest) => Promise<MediaAsset[]>
  onCommitPastedImages?: (assets: MediaAsset[], body: string) => void
  resolveMediaUrl?: (asset: MediaAsset) => string
  disabled?: boolean
}

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

function markdownHeadingIndex(value: string, position: number): number {
  return value.slice(0, Math.max(0, position)).split('\n').filter((line) => /^#{1,6}\s/.test(line)).length - 1
}

function activeBlockReference(editor: Editor | null, nodeName: 'table' | 'codeBlock') {
  if (!editor) return null
  const anchor = editor.view.dom.ownerDocument.getSelection()?.anchorNode
  const origin = anchor instanceof Element ? anchor : anchor?.parentElement
  let element = origin?.closest<HTMLElement>(nodeName === 'table' ? 'table' : 'pre') ?? null
  if (!element) {
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name !== nodeName) continue
      const node = editor.view.nodeDOM($from.before(depth))
      element = node instanceof HTMLElement ? node : node?.parentElement ?? null
      break
    }
  }
  if (!element) return null
  return {
    contextElement: element,
    getBoundingClientRect: () => element.getBoundingClientRect(),
  }
}

function BlockContextMenu({ editor, nodeName, label, children, placement = 'adaptive-center' }: {
  editor: Editor | null
  nodeName: 'table' | 'codeBlock'
  label: string
  children: ReactNode
  placement?: 'adaptive-center' | 'below-end'
}) {
  const [position, setPosition] = useState<{ left: number; top: number; below: boolean } | null>(null)

  const updatePosition = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isActive(nodeName)) {
      setPosition(null)
      return
    }
    const reference = activeBlockReference(editor, nodeName)
    if (!reference) {
      setPosition(null)
      return
    }
    const rect = reference.getBoundingClientRect()
    const below = placement === 'below-end' || rect.top < 72
    setPosition({
      left: placement === 'below-end' ? rect.right : rect.left + rect.width / 2,
      top: below ? rect.bottom + 10 : rect.top - 10,
      below,
    })
  }, [editor, nodeName, placement])

  useEffect(() => {
    if (!editor) return
    editor.on('selectionUpdate', updatePosition)
    editor.on('transaction', updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const initialFrame = window.requestAnimationFrame(updatePosition)
    return () => {
      window.cancelAnimationFrame(initialFrame)
      editor.off('selectionUpdate', updatePosition)
      editor.off('transaction', updatePosition)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [editor, updatePosition])

  if (!position) return null
  return createPortal(
    <div
      className="editor-context-toolbar"
      data-kind={nodeName}
      data-placement={position.below ? 'below' : 'above'}
      data-align={placement === 'below-end' ? 'end' : 'center'}
      role="toolbar"
      aria-label={label}
      style={{ left: position.left, top: position.top }}
      onMouseDown={placement === 'below-end' ? undefined : (event) => event.preventDefault()}
    >{children}</div>,
    document.body,
  )
}

function CodeLanguageControl({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const [language, setLanguage] = useState('')

  const syncLanguage = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isActive('codeBlock')) {
      setLanguage('')
      return
    }
    setLanguage(String(editor.getAttributes('codeBlock').language ?? ''))
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.on('selectionUpdate', syncLanguage)
    editor.on('transaction', syncLanguage)
    const initialFrame = window.requestAnimationFrame(syncLanguage)
    return () => {
      window.cancelAnimationFrame(initialFrame)
      editor.off('selectionUpdate', syncLanguage)
      editor.off('transaction', syncLanguage)
    }
  }, [editor, syncLanguage])

  return <input
    className="editor-code-language"
    aria-label="代码语言"
    value={language}
    placeholder="语言"
    spellCheck={false}
    disabled={disabled}
    onChange={(event) => {
      const next = event.currentTarget.value.trim().toLowerCase()
      setLanguage(next)
      editor?.commands.updateAttributes('codeBlock', { language: next || null })
    }}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
    }}
  />
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({
  value,
  onChange,
  media,
  status,
  preparePastedImages,
  onCommitPastedImages,
  resolveMediaUrl,
  disabled = false,
}, ref) {
  const sourceRef = useRef<SourceMarkdownEditorHandle>(null)
  const tableButtonRef = useRef<HTMLButtonElement>(null)
  const latestValueRef = useRef(value)
  const emittedValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const preparePastedImagesRef = useRef(preparePastedImages)
  const onCommitPastedImagesRef = useRef(onCommitPastedImages)
  const richComposingRef = useRef(false)
  const richCompositionPendingRef = useRef(false)
  const richCompositionStartRef = useRef<number | null>(null)
  const richCompositionTextRef = useRef('')
  const [mode, setMode] = useState<EditorMode>('rich')
  const [tableDialogOpen, setTableDialogOpen] = useState(false)

  useLayoutEffect(() => {
    if (!richComposingRef.current && !richCompositionPendingRef.current) latestValueRef.current = value
    onChangeRef.current = onChange
    preparePastedImagesRef.current = preparePastedImages
    onCommitPastedImagesRef.current = onCommitPastedImages
  }, [onChange, onCommitPastedImages, preparePastedImages, value])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: true, allowBase64: false }),
      Markdown,
    ],
    content: value,
    contentType: 'markdown',
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'imx-rich-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Markdown 编辑器',
      },
      handlePaste(_view, event) {
        const files = clipboardImages(event.clipboardData)
        const prepare = preparePastedImagesRef.current
        const commit = onCommitPastedImagesRef.current
        if (files.length === 0 || !prepare || !commit) return false
        event.preventDefault()
        const current = latestValueRef.current
        void prepare({ files, selection: { from: current.length, to: current.length }, value: current })
          .then((assets) => {
            if (assets.length === 0 || !editor || editor.isDestroyed) return
            const imageMarkdown = assets
              .map((asset) => `![${mediaAlt(asset.name)}](images/${asset.name})`)
              .join('\n\n')
            const body = [editor.getMarkdown().trimEnd(), imageMarkdown].filter(Boolean).join('\n\n')
            latestValueRef.current = body
            onChangeRef.current(body)
            commit(assets, body)
          })
          .catch(() => undefined)
        return true
      },
      handleKeyDown(view, event) {
        if (event.key !== 'Tab') return false
        const { $from } = view.state.selection
        if ($from.parent.type.name !== 'codeBlock') return false
        event.preventDefault()
        const { from, to } = view.state.selection
        if (!event.shiftKey) {
          view.dispatch(view.state.tr.insertText('  ', from, to).scrollIntoView())
          return true
        }
        const code = $from.parent.textContent
        const lineStartOffset = code.lastIndexOf('\n', Math.max(0, $from.parentOffset - 1)) + 1
        const leadingSpaces = code.slice(lineStartOffset).match(/^ {1,2}/)?.[0].length ?? 0
        if (leadingSpaces > 0) {
          const lineStart = $from.start() + lineStartOffset
          view.dispatch(view.state.tr.delete(lineStart, lineStart + leadingSpaces).scrollIntoView())
        }
        return true
      },
      handleDOMEvents: {
        beforeinput(_view, event) {
          const inputEvent = event as InputEvent
          if (inputEvent.isComposing || inputEvent.inputType === 'insertCompositionText') {
            richComposingRef.current = true
            richCompositionPendingRef.current = true
            if (richCompositionStartRef.current === null) richCompositionStartRef.current = editor?.state.selection.from ?? null
            if (inputEvent.data) richCompositionTextRef.current = inputEvent.data
          }
          return false
        },
        compositionstart() {
          richComposingRef.current = true
          richCompositionPendingRef.current = true
          richCompositionStartRef.current = editor?.state.selection.from ?? null
          richCompositionTextRef.current = ''
          return false
        },
        compositionend(_view, event) {
          richComposingRef.current = false
          richCompositionPendingRef.current = true
          const committedText = (event as CompositionEvent).data || richCompositionTextRef.current
          const compositionStart = richCompositionStartRef.current
          if (committedText) richCompositionTextRef.current = committedText
          window.requestAnimationFrame(() => {
            if (!editor || editor.isDestroyed) return
            const next = editor.getMarkdown()
            emittedValueRef.current = next
            latestValueRef.current = next
            onChangeRef.current(next)
            if (compositionStart !== null && committedText) {
              const target = Math.min(compositionStart + committedText.length, editor.state.doc.content.size)
              try {
                editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target)).scrollIntoView())
              } catch {
                // Some complex IME replacements can invalidate the saved position; ignore and keep the document stable.
              }
            }
            richCompositionStartRef.current = null
            richCompositionTextRef.current = ''
          })
          return false
        },
      },
    },
    onUpdate({ editor: currentEditor }) {
      if (richComposingRef.current || (currentEditor.view as { composing?: boolean }).composing) return
      const next = currentEditor.getMarkdown()
      emittedValueRef.current = next
      latestValueRef.current = next
      onChangeRef.current(next)
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor || mode !== 'rich') return
    if (richComposingRef.current || (editor.view as { composing?: boolean }).composing) return
    if (richCompositionPendingRef.current) {
      if (value === emittedValueRef.current) richCompositionPendingRef.current = false
      return
    }
    if (value === emittedValueRef.current) return
    const current = editor.getMarkdown()
    if (current === value) return
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    emittedValueRef.current = value
  }, [editor, mode, value])

  const mediaUrls = useMemo(() => new Map(media
    .filter((asset) => asset.kind === 'body' && resolveMediaUrl)
    .map((asset) => [`images/${asset.name}`, resolveMediaUrl!(asset)])), [media, resolveMediaUrl])

  useEffect(() => {
    if (!editor) return
    const root = editor.view.dom
    root.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
      const source = image.getAttribute('src') ?? ''
      const resolved = mediaUrls.get(source)
      if (resolved && image.src !== resolved) image.src = resolved
    })
  }, [editor, mediaUrls, value])

  const switchMode = useCallback(() => {
    if (!editor) return
    if (mode === 'rich') {
      const next = latestValueRef.current
      latestValueRef.current = next
      emittedValueRef.current = next
      if (next !== value) onChangeRef.current(next)
      setMode('source')
      return
    }
    editor.commands.setContent(latestValueRef.current, { contentType: 'markdown', emitUpdate: false })
    emittedValueRef.current = latestValueRef.current
    setMode('rich')
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.commands.focus()
    })
  }, [editor, mode, value])

  const handleSourceChange = useCallback((next: string) => {
    latestValueRef.current = next
    emittedValueRef.current = next
    onChangeRef.current(next)
  }, [])

  const insertTable = ({ dataRows, columns }: MarkdownTableDimensions) => {
    if (!editor || disabled) return
    editor.chain().focus().insertTable({ rows: dataRows + 1, cols: columns, withHeaderRow: true }).run()
  }

  useImperativeHandle(ref, () => ({
    focusPosition(position: number) {
      if (!editor) return
      if (mode === 'source') {
        sourceRef.current?.focusPosition(position)
        return
      }
      const targetIndex = markdownHeadingIndex(latestValueRef.current, position)
      let seen = -1
      let target = 1
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'heading') return
        seen += 1
        if (seen === targetIndex) target = pos + 1
      })
      editor.chain().focus(target).scrollIntoView().run()
    },
    insertImage(name: string, alt: string) {
      if (!editor || disabled) return
      editor.chain().focus().setImage({ src: `images/${name}`, alt }).run()
    },
  }), [disabled, editor, mode])

  return <>
    <section className="markdown-editor" data-mode={mode} aria-label="Markdown 编辑">
      <div className="editor-toolbar" role="toolbar" aria-label="Markdown 格式">
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}>加粗</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}>斜体</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>标题</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBulletList().run()}>列表</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleTaskList().run()}>任务</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>引用</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>代码</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => {
          const href = window.prompt('请输入链接地址')
          if (href) editor?.chain().focus().extendMarkRange('link').setLink({ href }).run()
        }}>链接</button>
        <button ref={tableButtonRef} type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => setTableDialogOpen(true)}>表格</button>
        <span className="editor-toolbar-spacer" aria-hidden="true" />
        {status ? <p className="editor-save-status" role="status">{status}</p> : null}
        <button className="editor-mode-toggle" type="button" aria-pressed={mode === 'source'} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={switchMode}>{mode === 'rich' ? '源代码' : '即时排版'}</button>
      </div>
      <div className="editor-scroll-region">
        {mode === 'rich'
          ? <>
            <BlockContextMenu
              editor={editor}
              nodeName="table"
              label="表格操作"
            >
              <>
                <button type="button" onClick={() => editor?.chain().focus().addRowAfter().run()}>添加行</button>
                <button type="button" onClick={() => editor?.chain().focus().deleteRow().run()}>删除行</button>
                <button type="button" onClick={() => editor?.chain().focus().addColumnAfter().run()}>添加列</button>
                <button type="button" onClick={() => editor?.chain().focus().deleteColumn().run()}>删除列</button>
                <button type="button" onClick={() => editor?.chain().focus().setCellAttribute('align', 'left').run()}>左对齐</button>
                <button type="button" onClick={() => editor?.chain().focus().setCellAttribute('align', 'center').run()}>居中</button>
                <button type="button" onClick={() => editor?.chain().focus().setCellAttribute('align', 'right').run()}>右对齐</button>
                <button type="button" onClick={() => editor?.chain().focus().goToNextCell().run()}>下一单元格</button>
                <button className="danger" type="button" onClick={() => editor?.chain().focus().deleteTable().run()}>删除表格</button>
              </>
            </BlockContextMenu>
            <BlockContextMenu
              editor={editor}
              nodeName="codeBlock"
              label="代码块操作"
              placement="below-end"
            >
              <CodeLanguageControl editor={editor} disabled={disabled} />
            </BlockContextMenu>
            <EditorContent editor={editor} />
          </>
          : <Suspense fallback={<div className="editor-loading" role="status">正在加载源代码编辑器…</div>}><SourceMarkdownEditor ref={sourceRef} value={value} disabled={disabled} onChange={handleSourceChange} /></Suspense>}
      </div>
    </section>
    {tableDialogOpen && <TableDialog onClose={() => setTableDialogOpen(false)} onInsert={insertTable} returnFocus={() => tableButtonRef.current} />}
  </>
})

import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { getMarkRange, type Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { common, createLowlight } from 'lowlight'
import type { MediaAsset } from '../metadata/article'
import { mediaAlt } from '../media/names'
import type { EditorMode } from './editor-mode'
import type { MarkdownTableDimensions } from './markdown-commands'
import { extractEditorOutline } from './outline'
import { clipboardImages, type PastedImageRequest } from './paste'
import { RawMarkdownBlock, RawMarkdownInline, SafeCodeBlock, SafeTable } from './markdown-extensions'
import { TableDialog } from './TableDialog'
import { LinkDialog } from './LinkDialog'
import { DeferredMarkdown, editorMarkdown, pauseDeferredMarkdown } from './deferred-markdown'
import type { SourceMarkdownEditorHandle } from './SourceMarkdownEditor'
import './editor.css'

const SourceMarkdownEditor = lazy(() => import('./SourceMarkdownEditor'))
const lowlight = createLowlight(common)

export interface MarkdownEditorHandle {
  focusPosition(position: number): void
  insertImage(name: string, alt: string): void
}

export type { PastedImageRequest } from './paste'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  media: MediaAsset[]
  status?: string
  statusTone?: 'info' | 'pending' | 'success' | 'error'
  toolbarTarget?: HTMLElement | null
  onFormatApplied?: () => void
  preparePastedImages?: (request: PastedImageRequest) => Promise<MediaAsset[]>
  onCommitPastedImages?: (assets: MediaAsset[], body: string) => void
  resolveMediaUrl?: (asset: MediaAsset) => string
  disabled?: boolean
}

function markdownHeadingIndex(value: string, position: number): number {
  const headings = extractEditorOutline(value)
  const exact = headings.findIndex((heading) => heading.from === position)
  if (exact >= 0) return exact
  let closest = 0
  headings.forEach((heading, index) => {
    if (heading.from <= position) closest = index
  })
  return closest
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

function activeTableState(editor: Editor | null) {
  if (!editor || editor.isDestroyed || !editor.isActive('table')) return null
  const { $from } = editor.state.selection
  let tableDepth = -1
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'table') {
      tableDepth = depth
      break
    }
  }
  if (tableDepth < 0) return null
  const table = $from.node(tableDepth)
  const rowIndex = $from.index(tableDepth)
  const columnIndex = $from.index(tableDepth + 1)
  return {
    table,
    tablePosition: $from.before(tableDepth),
    rowIndex,
    columnIndex,
    rows: table.childCount,
    columns: table.firstChild?.childCount ?? 0,
  }
}

function setTableColumnAlignment(editor: Editor | null, align: 'left' | 'center' | 'right') {
  const context = activeTableState(editor)
  if (!editor || !context) return false
  const transaction = editor.state.tr
  context.table.forEach((row, rowOffset) => {
    row.forEach((cell, cellOffset, columnIndex) => {
      if (columnIndex !== context.columnIndex) return
      const position = context.tablePosition + 1 + rowOffset + 1 + cellOffset
      transaction.setNodeMarkup(position, undefined, { ...cell.attrs, align })
    })
  })
  editor.view.dispatch(transaction)
  editor.commands.focus()
  return true
}

function TableContextControls({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const [, setVersion] = useState(0)
  useEffect(() => {
    if (!editor) return
    const update = () => setVersion((value) => value + 1)
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
    }
  }, [editor])
  const table = activeTableState(editor)
  const cannotDeleteRow = !table || table.rowIndex === 0 || table.rows <= 2
  const cannotDeleteColumn = !table || table.columns <= 2
  return <>
    <button type="button" disabled={disabled} onClick={() => editor?.chain().focus().addRowAfter().run()}>添加行</button>
    <button type="button" disabled={disabled || cannotDeleteRow} title={table?.rowIndex === 0 ? '表头不可删除' : '至少保留一条数据行'} onClick={() => editor?.chain().focus().deleteRow().run()}>删除行</button>
    <button type="button" disabled={disabled} onClick={() => editor?.chain().focus().addColumnAfter().run()}>添加列</button>
    <button type="button" disabled={disabled || cannotDeleteColumn} title="至少保留两列" onClick={() => editor?.chain().focus().deleteColumn().run()}>删除列</button>
    <button type="button" disabled={disabled} onClick={() => setTableColumnAlignment(editor, 'left')}>左对齐</button>
    <button type="button" disabled={disabled} onClick={() => setTableColumnAlignment(editor, 'center')}>居中</button>
    <button type="button" disabled={disabled} onClick={() => setTableColumnAlignment(editor, 'right')}>右对齐</button>
    <button type="button" disabled={disabled} onClick={() => editor?.chain().focus().goToNextCell().run()}>下一单元格</button>
    <button className="danger" type="button" disabled={disabled} onClick={() => editor?.chain().focus().deleteTable().run()}>删除表格</button>
  </>
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({
  value,
  onChange,
  media,
  status,
  statusTone = 'info',
  toolbarTarget,
  onFormatApplied,
  preparePastedImages,
  onCommitPastedImages,
  resolveMediaUrl,
  disabled = false,
}, ref) {
  const sourceRef = useRef<SourceMarkdownEditorHandle>(null)
  const tableButtonRef = useRef<HTMLButtonElement>(null)
  const linkButtonRef = useRef<HTMLButtonElement>(null)
  const latestValueRef = useRef(value)
  const emittedValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const preparePastedImagesRef = useRef(preparePastedImages)
  const onCommitPastedImagesRef = useRef(onCommitPastedImages)
  const richEditorRef = useRef<Editor | null>(null)
  const richComposingRef = useRef(false)
  const richCompositionPendingRef = useRef(false)
  const [mode, setMode] = useState<EditorMode>('rich')
  const [tableDialogOpen, setTableDialogOpen] = useState(false)
  const [linkDialog, setLinkDialog] = useState<{ from: number; to: number; href: string; text: string } | null>(null)

  useLayoutEffect(() => {
    if (!richComposingRef.current && !richCompositionPendingRef.current) latestValueRef.current = value
    onChangeRef.current = onChange
    preparePastedImagesRef.current = preparePastedImages
    onCommitPastedImagesRef.current = onCommitPastedImages
  }, [onChange, onCommitPastedImages, preparePastedImages, value])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: { openOnClick: false, enableClickSelection: true } }),
      SafeCodeBlock.configure({ lowlight }),
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
      DeferredMarkdown,
    ],
    // Typed headings/inline syntax commit on leaving the line, not mid-input.
    enableInputRules: ['codeBlock', 'horizontalRule'],
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
        paste(_view, event) {
          const clipboardEvent = event as ClipboardEvent
          const files = clipboardImages(clipboardEvent.clipboardData)
          const prepare = preparePastedImagesRef.current
          const commit = onCommitPastedImagesRef.current
          if (files.length === 0 || !prepare || !commit) return false
          clipboardEvent.preventDefault()
          const currentEditor = richEditorRef.current
          const current = currentEditor ? editorMarkdown(currentEditor) : latestValueRef.current
          const selection = currentEditor?.state.selection
          const from = selection?.from ?? 1
          const to = selection?.to ?? from
          void prepare({ files, selection: { from, to }, value: current })
            .then((assets) => {
              const activeEditor = richEditorRef.current
              if (assets.length === 0 || !activeEditor || activeEditor.isDestroyed) return
              const max = activeEditor.state.doc.content.size
              const safeFrom = Math.max(1, Math.min(max, from))
              const safeTo = Math.max(safeFrom, Math.min(max, to))
              const content = assets.flatMap((asset, index) => [
                { type: 'image', attrs: { src: `images/${asset.name}`, alt: mediaAlt(asset.name) } },
                ...(index < assets.length - 1 ? [{ type: 'hardBreak' }] : []),
              ])
              activeEditor.chain().focus().setTextSelection({ from: safeFrom, to: safeTo }).insertContent(content).run()
              commit(assets, editorMarkdown(activeEditor))
            })
            .catch(() => undefined)
          return true
        },
        beforeinput(_view, event) {
          const inputEvent = event as InputEvent
          if (inputEvent.isComposing || inputEvent.inputType === 'insertCompositionText') {
            richComposingRef.current = true
            richCompositionPendingRef.current = true
          }
          return false
        },
        compositionstart() {
          richComposingRef.current = true
          richCompositionPendingRef.current = true
          return false
        },
        compositionend() {
          richComposingRef.current = false
          richCompositionPendingRef.current = true
          window.requestAnimationFrame(() => {
            const activeEditor = richEditorRef.current
            if (!activeEditor || activeEditor.isDestroyed) return
            const next = editorMarkdown(activeEditor)
            emittedValueRef.current = next
            latestValueRef.current = next
            onChangeRef.current(next)
          })
          return false
        },
      },
    },
    onUpdate({ editor: currentEditor }) {
      if (richComposingRef.current || (currentEditor.view as { composing?: boolean }).composing) return
      const next = editorMarkdown(currentEditor)
      emittedValueRef.current = next
      latestValueRef.current = next
      onChangeRef.current(next)
    },
  })

  const activeFormats = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      blockquote: Boolean(currentEditor?.isActive('blockquote')),
      bold: Boolean(currentEditor?.isActive('bold')),
      bulletList: Boolean(currentEditor?.isActive('bulletList')),
      codeBlock: Boolean(currentEditor?.isActive('codeBlock')),
      heading: Boolean(currentEditor?.isActive('heading', { level: 2 })),
      italic: Boolean(currentEditor?.isActive('italic')),
      strike: Boolean(currentEditor?.isActive('strike')),
      link: Boolean(currentEditor?.isActive('link')),
      taskList: Boolean(currentEditor?.isActive('taskList')),
    }),
  })

  useEffect(() => {
    richEditorRef.current = editor
    return () => {
      if (richEditorRef.current === editor) richEditorRef.current = null
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled, false)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor || mode !== 'rich') return
    if (richComposingRef.current || (editor.view as { composing?: boolean }).composing) return
    if (richCompositionPendingRef.current) {
      if (value === emittedValueRef.current) richCompositionPendingRef.current = false
      return
    }
    if (value === emittedValueRef.current) return
    const current = editorMarkdown(editor)
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
    onFormatApplied?.()
  }

  const openLinkDialog = () => {
    if (!editor || disabled || mode !== 'rich') return
    pauseDeferredMarkdown(editor, true)
    const selection = editor.state.selection
    const linkRange = selection.empty ? getMarkRange(selection.$from, editor.schema.marks.link) : undefined
    const { from, to } = linkRange ?? selection
    setLinkDialog({ from, to, href: String(editor.getAttributes('link').href ?? ''), text: editor.state.doc.textBetween(from, to, '\n') })
  }

  const applyLink = (href: string, text: string) => {
    if (!editor || !linkDialog || disabled) return
    const { from, to } = linkDialog
    if (from < to && text === linkDialog.text) {
      editor.chain().focus().setTextSelection({ from, to }).setLink({ href }).run()
    } else {
      editor.chain().focus().insertContentAt({ from, to }, { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }).run()
    }
    onFormatApplied?.()
  }

  const removeLink = () => {
    if (!editor || !linkDialog || disabled) return
    editor.chain().focus().setTextSelection({ from: linkDialog.from, to: linkDialog.to }).unsetLink().run()
    onFormatApplied?.()
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
      if (mode === 'source') {
        sourceRef.current?.insertMarkdown(`![${alt}](images/${name})`)
        return
      }
      editor.chain().focus().setImage({ src: `images/${name}`, alt }).run()
    },
  }), [disabled, editor, mode])

  const toolbar = <div className="editor-toolbar" role="toolbar" aria-label="Markdown 格式" onClick={(event) => {
    const button = (event.target as HTMLElement).closest('button')
    if (button && button !== tableButtonRef.current && button !== linkButtonRef.current && !button.disabled) onFormatApplied?.()
  }}>
      <div className="editor-tool-group" role="group" aria-label="文字样式">
        <h3>文字样式</h3>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.bold)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}>加粗</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.italic)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}>斜体</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.strike)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleStrike().run()}>删除线</button>
      </div>
      <div className="editor-tool-group" role="group" aria-label="段落结构">
        <h3>段落结构</h3>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.heading)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>二级标题</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.bulletList)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBulletList().run()}>无序列表</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.taskList)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleTaskList().run()}>任务列表</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.blockquote)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>引用</button>
      </div>
      <div className="editor-tool-group" role="group" aria-label="插入内容">
        <h3>插入内容</h3>
        <button ref={linkButtonRef} type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.link)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={openLinkDialog}>链接</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.codeBlock)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>代码块</button>
        <button ref={tableButtonRef} type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => setTableDialogOpen(true)}>表格</button>
      </div>
      <div className="editor-tool-group" role="group" aria-label="编辑模式">
        <h3>编辑模式</h3>
        <button className="editor-mode-toggle" type="button" aria-pressed={mode === 'source'} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={switchMode}>{mode === 'rich' ? '源代码' : '即时排版'}</button>
      </div>
      </div>

  return <>
    {toolbarTarget ? createPortal(toolbar, toolbarTarget) : null}
    <section className="markdown-editor" data-mode={mode} aria-label="Markdown 编辑">
      {toolbarTarget === undefined ? toolbar : null}
      {status ? <div className="editor-status-bar">
        <p className="editor-save-status" data-tone={statusTone} role="status">{status}</p>
      </div> : null}
      <div className="editor-scroll-region">
        {mode === 'rich'
          ? <>
            <BlockContextMenu
              editor={editor}
              nodeName="table"
              label="表格操作"
            >
              <TableContextControls editor={editor} disabled={disabled} />
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
          : <Suspense fallback={<div className="editor-loading" role="status">正在加载源代码编辑器…</div>}><SourceMarkdownEditor ref={sourceRef} value={value} disabled={disabled} onChange={handleSourceChange} preparePastedImages={preparePastedImages} onCommitPastedImages={onCommitPastedImages} /></Suspense>}
      </div>
    </section>
    {tableDialogOpen && <TableDialog onClose={() => setTableDialogOpen(false)} onInsert={insertTable} returnFocus={() => tableButtonRef.current} />}
    {linkDialog && <LinkDialog initialHref={linkDialog.href} initialText={linkDialog.text} onClose={() => {
      setLinkDialog(null)
      if (editor && !editor.isDestroyed) pauseDeferredMarkdown(editor, false)
    }} onApply={applyLink} onRemove={removeLink} returnFocus={() => linkButtonRef.current} />}
  </>
})

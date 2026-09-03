import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { getMarkRange, type ChainedCommands, type Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { common, createLowlight } from 'lowlight'
import type { MediaAsset } from '../metadata/article'
import { mediaAlt } from '../media/names'
import type { EditorMode } from './editor-mode'
import type { EditorFont } from './editor-font'
import { extractEditorOutline } from './outline'
import { clipboardImages, containsPastedMarkdown, type PastedImageRequest } from './paste'
import { AlwaysTrailingParagraph, CalloutBlock, FootnoteDefinition, FootnoteReference, MathBlock, MathInline, MermaidBlock, RawMarkdownBlock, RawMarkdownInline, SafeCodeBlock, SafeImage, SafeTable, SpecialBlockInput, Subscript, Superscript, TextHighlight } from './markdown-extensions'
import { TableDialog, type MarkdownTableDimensions } from './TableDialog'
import { LinkDialog } from './LinkDialog'
import { SyntaxDialog, type SyntaxDialogValue } from './SyntaxDialog'
import { CalloutDialog, type CalloutKind } from './CalloutDialog'
import { DeferredMarkdown, editorMarkdown, pauseDeferredMarkdown, toolbarMarkdownCaretKey, toolbarMarkdownMarkersKey } from './deferred-markdown'
import type { SourceMarkdownEditorHandle } from './SourceMarkdownEditor'
import { AccessibleDialog } from '../app/AccessibleDialog'
import './editor-fonts.css'
import './editor.css'

const SourceMarkdownEditor = lazy(() => import('./SourceMarkdownEditor'))
const lowlight = createLowlight(common)
type InlineSyntaxDialogKind = 'math-inline'

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
  statusActions?: ReactNode
  toolbarTarget?: HTMLElement | null
  onFormatApplied?: () => void
  preparePastedImages?: (request: PastedImageRequest) => Promise<MediaAsset[]>
  onCommitPastedImages?: (assets: MediaAsset[], body: string) => void
  resolveMediaUrl?: (asset: MediaAsset) => string
  disabled?: boolean
  initialMode?: EditorMode
  font?: EditorFont
  focusMode?: boolean
  typewriterMode?: boolean
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
  const toolbarRef = useRef<HTMLDivElement>(null)
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
    const toolbar = toolbarRef.current
    const width = toolbar?.offsetWidth ?? 0
    const height = toolbar?.offsetHeight ?? 0
    const margin = 12
    const visibleLeft = Math.max(margin, rect.left)
    const visibleRight = Math.min(window.innerWidth - margin, rect.right)
    const idealLeft = placement === 'below-end' ? visibleRight : (visibleLeft + visibleRight) / 2
    const minimumLeft = placement === 'below-end' ? width + margin : width / 2 + margin
    const maximumLeft = placement === 'below-end' ? window.innerWidth - margin : window.innerWidth - width / 2 - margin
    const idealTop = below ? rect.bottom + 10 : rect.top - 10
    const minimumTop = below ? margin : height + margin
    const maximumTop = below ? window.innerHeight - height - margin : window.innerHeight - margin
    const next = {
      left: Math.max(minimumLeft, Math.min(maximumLeft, idealLeft)),
      top: Math.max(minimumTop, Math.min(maximumTop, idealTop)),
      below,
    }
    setPosition((current) => {
      if (current && current.left === next.left && current.top === next.top && current.below === next.below) return current
      return next
    })
  }, [editor, nodeName, placement])

  const shown = position !== null
  useLayoutEffect(() => {
    if (!shown) return
    const frame = window.requestAnimationFrame(updatePosition)
    return () => window.cancelAnimationFrame(frame)
  }, [shown, updatePosition])

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
      ref={toolbarRef}
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
  statusActions,
  toolbarTarget,
  onFormatApplied,
  preparePastedImages,
  onCommitPastedImages,
  resolveMediaUrl,
  disabled = false,
  initialMode = 'rich',
  font = 'serif',
  focusMode = false,
  typewriterMode = false,
}, ref) {
  const sourceRef = useRef<SourceMarkdownEditorHandle>(null)
  const tableButtonRef = useRef<HTMLButtonElement>(null)
  const linkButtonRef = useRef<HTMLButtonElement>(null)
  const syntaxButtonRef = useRef<HTMLElement>(null)
  const calloutButtonRef = useRef<HTMLButtonElement>(null)
  const calloutReturnFocusRef = useRef<HTMLElement | null>(null)
  const latestValueRef = useRef(value)
  const emittedValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const preparePastedImagesRef = useRef(preparePastedImages)
  const onCommitPastedImagesRef = useRef(onCommitPastedImages)
  const richEditorRef = useRef<Editor | null>(null)
  const richComposingRef = useRef(false)
  const richCompositionPendingRef = useRef(false)
  const mode = initialMode
  const modeRef = useRef<EditorMode>(mode)
  const previousModeRef = useRef<EditorMode>(mode)
  const [sourceHistory, setSourceHistory] = useState({ canUndo: false, canRedo: false })
  const [tableDialogOpen, setTableDialogOpen] = useState(false)
  const [linkDialog, setLinkDialog] = useState<{ from: number; to: number; href: string; text: string } | null>(null)
  const [syntaxDialog, setSyntaxDialog] = useState<{ kind: InlineSyntaxDialogKind; initial?: SyntaxDialogValue; nodePos?: number } | null>(null)
  const [calloutDialogOpen, setCalloutDialogOpen] = useState(false)
  const [slashOpen, setSlashOpen] = useState(false)

  useLayoutEffect(() => {
    if (!richComposingRef.current && !richCompositionPendingRef.current) latestValueRef.current = value
    onChangeRef.current = onChange
    modeRef.current = mode
    preparePastedImagesRef.current = preparePastedImages
    onCommitPastedImagesRef.current = onCommitPastedImages
  }, [mode, onChange, onCommitPastedImages, preparePastedImages, value])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, trailingNode: false, link: { openOnClick: false, enableClickSelection: true } }),
      SafeCodeBlock.configure({ lowlight }),
      SafeTable.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      SafeImage.configure({ inline: false, allowBase64: false }),
      TextHighlight,
      Subscript,
      Superscript,
      MathBlock,
      MathInline,
      CalloutBlock,
      MermaidBlock,
      FootnoteReference,
      FootnoteDefinition,
      RawMarkdownBlock,
      RawMarkdownInline,
      Markdown,
      DeferredMarkdown,
      SpecialBlockInput,
      AlwaysTrailingParagraph,
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
        const { $from } = view.state.selection
        let deletionCursor = $from
        if (event.key === 'Backspace' && view.state.selection.empty) {
          const nativeSelection = view.dom.ownerDocument.getSelection()
          if (nativeSelection?.isCollapsed && nativeSelection.anchorNode && view.dom.contains(nativeSelection.anchorNode)) {
            try {
              deletionCursor = view.state.doc.resolve(view.posAtDOM(nativeSelection.anchorNode, nativeSelection.anchorOffset))
            } catch {
              // Fall back to ProseMirror's selection when the browser exposes
              // a transient DOM position that cannot be mapped yet.
            }
          }
        }
        if (event.key === 'Backspace'
          && view.state.selection.empty
          && deletionCursor.parent.type.name === 'heading'
          && deletionCursor.parentOffset === 0) {
          event.preventDefault()
          const headingPosition = deletionCursor.before(deletionCursor.depth)
          const transaction = view.state.tr
            .setNodeMarkup(headingPosition, view.state.schema.nodes.paragraph, {})
          transaction.setSelection(TextSelection.create(transaction.doc, headingPosition + 1))
          view.dispatch(transaction.scrollIntoView())
          view.focus()
          return true
        }
        if ((event.key === 'Backspace' || event.key === 'Delete')
          && view.state.selection.empty
          && $from.parent.type.name === 'codeBlock'
          && $from.parent.content.size === 0) {
          event.preventDefault()
          const blockPosition = $from.before($from.depth)
          const codeBlock = $from.parent
          const transaction = view.state.tr
          if (transaction.doc.childCount === 1) {
            transaction.replaceWith(blockPosition, blockPosition + codeBlock.nodeSize, view.state.schema.nodes.paragraph.create())
            transaction.setSelection(TextSelection.create(transaction.doc, blockPosition + 1))
          } else {
            transaction.delete(blockPosition, blockPosition + codeBlock.nodeSize)
            transaction.setSelection(TextSelection.near(
              transaction.doc.resolve(Math.min(blockPosition, transaction.doc.content.size)),
              event.key === 'Backspace' ? -1 : 1,
            ))
          }
          view.dispatch(transaction.scrollIntoView())
          view.focus()
          return true
        }
        if (event.key === '/' && view.state.selection.empty && view.state.selection.$from.parent.textContent.length === 0 && view.state.selection.$from.parent.type.name === 'paragraph') {
          event.preventDefault()
          setSlashOpen(true)
          return true
        }
        if (event.key !== 'Tab') return false
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
          const activeEditor = richEditorRef.current
          const plainText = clipboardEvent.clipboardData?.getData('text/plain') ?? ''
          const markdownText = plainText.trim()
          if (files.length === 0 && activeEditor?.markdown && containsPastedMarkdown(markdownText)) {
            clipboardEvent.preventDefault()
            const parsed = activeEditor.markdown.parse(markdownText)
            activeEditor.chain().focus().insertContent(parsed.content ?? []).run()
            return true
          }
          if (files.length === 0 && activeEditor && !activeEditor.state.selection.empty && /^https?:\/\/\S+$/i.test(markdownText)) {
            clipboardEvent.preventDefault()
            activeEditor.chain().focus().setLink({ href: markdownText }).run()
            return true
          }
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
              if (assets.length === 0 || modeRef.current !== 'rich' || !activeEditor || activeEditor.isDestroyed) return
              const max = activeEditor.state.doc.content.size
              const unchanged = editorMarkdown(activeEditor) === current
              const target = unchanged ? { from, to } : activeEditor.state.selection
              const safeFrom = Math.max(1, Math.min(max, target.from))
              const safeTo = Math.max(safeFrom, Math.min(max, target.to))
              const content = assets.map((asset) => (
                { type: 'image', attrs: { src: `images/${asset.name}`, alt: mediaAlt(asset.name) } }
              ))
              activeEditor.chain().focus().setTextSelection({ from: safeFrom, to: safeTo }).insertContent(content).run()
              commit(assets, editorMarkdown(activeEditor))
            })
            .catch(() => undefined)
          return true
        },
        drop(_view, event) {
          const files = clipboardImages((event as DragEvent).dataTransfer)
          const prepare = preparePastedImagesRef.current
          const commit = onCommitPastedImagesRef.current
          const activeEditor = richEditorRef.current
          if (files.length === 0 || !prepare || !commit || !activeEditor) return false
          event.preventDefault()
          const coordinates = activeEditor.view.posAtCoords({ left: event.clientX, top: event.clientY })
          const position = coordinates?.pos ?? activeEditor.state.selection.from
          const current = editorMarkdown(activeEditor)
          void prepare({ files, selection: { from: position, to: position }, value: current }).then((assets) => {
            const currentEditor = richEditorRef.current
            if (!currentEditor || currentEditor.isDestroyed || assets.length === 0 || modeRef.current !== 'rich') return
            const content = assets.map((asset) => (
              { type: 'image', attrs: { src: `images/${asset.name}`, alt: mediaAlt(asset.name) } }
            ))
            const safePosition = Math.max(1, Math.min(currentEditor.state.doc.content.size, position))
            currentEditor.chain().focus().insertContentAt(safePosition, content).run()
            commit(assets, editorMarkdown(currentEditor))
          }).catch(() => undefined)
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
      handleDoubleClickOn(_view, pos, node) {
        const currentEditor = richEditorRef.current
        const dialogs: Record<string, { kind: InlineSyntaxDialogKind; initial: SyntaxDialogValue }> = {
          mathInline: { kind: 'math-inline', initial: { primary: String(node.attrs.latex ?? '') } },
        }
        const dialog = dialogs[node.type.name]
        if (!dialog) return false
        currentEditor?.commands.setNodeSelection(pos)
        syntaxButtonRef.current = currentEditor?.view.dom ?? null
        setSyntaxDialog({ ...dialog, nodePos: pos })
        return true
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
      headingLevel: currentEditor?.isActive('heading') ? Number(currentEditor.getAttributes('heading').level ?? 0) : 0,
      italic: Boolean(currentEditor?.isActive('italic')),
      strike: Boolean(currentEditor?.isActive('strike')),
      link: Boolean(currentEditor?.isActive('link')),
      taskList: Boolean(currentEditor?.isActive('taskList')),
      canBold: Boolean(currentEditor?.can().toggleBold()),
      canItalic: Boolean(currentEditor?.can().toggleItalic()),
      canStrike: Boolean(currentEditor?.can().toggleStrike()),
      canCode: Boolean(currentEditor?.can().toggleCode()),
      canHeading: Boolean(currentEditor?.can().toggleHeading({ level: 2 })),
      highlight: Boolean(currentEditor?.isActive('textHighlight')),
      subscript: Boolean(currentEditor?.isActive('subscript')),
      superscript: Boolean(currentEditor?.isActive('superscript')),
      canBulletList: Boolean(currentEditor?.can().toggleBulletList()),
      canOrderedList: Boolean(currentEditor?.can().toggleOrderedList()),
      canTaskList: Boolean(currentEditor?.can().toggleTaskList()),
      canBlockquote: Boolean(currentEditor?.can().toggleBlockquote()),
      canCodeBlock: Boolean(currentEditor?.can().toggleCodeBlock()),
      canUndo: Boolean(currentEditor?.can().undo()),
      canRedo: Boolean(currentEditor?.can().redo()),
      code: Boolean(currentEditor?.isActive('code')),
      orderedList: Boolean(currentEditor?.isActive('orderedList')),
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
    const root = editor.view.dom
    let previous: HTMLElement | null = null
    const sync = () => {
      previous?.removeAttribute('data-active-block')
      previous = null
      if (!focusMode) return
      const { $from } = editor.state.selection
      const position = $from.depth > 0 ? $from.before(1) : editor.state.selection.from
      const dom = editor.view.nodeDOM(position)
      let element = dom instanceof HTMLElement ? dom : dom?.parentElement ?? null
      while (element?.parentElement && element.parentElement !== root) element = element.parentElement
      if (element && element.parentElement === root) {
        element.setAttribute('data-active-block', '')
        previous = element
      }
    }
    const centerCaret = () => {
      sync()
      if (!typewriterMode) return
      const selection = window.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null
      const rect = range?.getBoundingClientRect()
      const scroller = root.closest<HTMLElement>('.editor-scroll-region')
      if (!rect || !scroller || rect.height === 0) return
      const bounds = scroller.getBoundingClientRect()
      const delta = rect.top - (bounds.top + bounds.height * .46)
      if (Math.abs(delta) > 48) scroller.scrollBy({ top: delta, behavior: 'smooth' })
    }
    editor.on('selectionUpdate', centerCaret)
    editor.on('focus', centerCaret)
    sync()
    return () => {
      editor.off('selectionUpdate', centerCaret)
      editor.off('focus', centerCaret)
      previous?.removeAttribute('data-active-block')
    }
  }, [editor, focusMode, mode, typewriterMode])

  useEffect(() => {
    const enteredRichMode = previousModeRef.current === 'source' && mode === 'rich'
    previousModeRef.current = mode
    if (!editor || mode !== 'rich') return
    if (richComposingRef.current || (editor.view as { composing?: boolean }).composing) return
    if (enteredRichMode) {
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
      emittedValueRef.current = value
      richCompositionPendingRef.current = false
      return
    }
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
    root.querySelectorAll<HTMLImageElement>('img[data-markdown-src]').forEach((image) => {
      const source = image.dataset.markdownSrc ?? ''
      const resolved = mediaUrls.get(source)
      const missing = source.startsWith('images/') && !resolved
      image.closest<HTMLElement>('.image-block-preview')?.toggleAttribute('data-missing-media', missing)
      if (missing) image.setAttribute('aria-hidden', 'true')
      else image.removeAttribute('aria-hidden')
      const nextSource = resolved ?? source
      if (image.getAttribute('src') !== nextSource) image.setAttribute('src', nextSource)
    })
  }, [editor, mediaUrls, value])

  const handleSourceChange = useCallback((next: string) => {
    latestValueRef.current = next
    emittedValueRef.current = next
    onChangeRef.current(next)
  }, [])

  const handleSourceHistoryChange = useCallback((next: { canUndo: boolean, canRedo: boolean }) => {
    setSourceHistory((current) => current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next)
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

  const runFormat = (command: (chain: ChainedCommands) => ChainedCommands) => {
    if (!editor || editor.isDestroyed || disabled || mode !== 'rich') return
    command(editor.chain().focus()).run()
    onFormatApplied?.()
    const requestFrame = editor.view.dom.ownerDocument.defaultView?.requestAnimationFrame
    if (!requestFrame) return
    requestFrame(() => requestFrame(() => {
      if (editor.isDestroyed || richComposingRef.current || editor.view.composing) return
      if (editor.view.dom.ownerDocument.activeElement !== editor.view.dom) editor.view.focus()
    }))
  }

  const runInlineFormat = (open: string, close: string) => {
    if (!editor || editor.isDestroyed || disabled || mode !== 'rich') return
    let { from, to } = editor.state.selection
    if (!editor.state.selection.$from.sameParent(editor.state.selection.$to)
      || !editor.state.selection.$from.parent.isTextblock) {
      const textRanges: Array<{ from: number; to: number }> = []
      editor.state.doc.nodesBetween(from, to, (node, position) => {
        if (!node.isTextblock) return true
        const range = {
          from: Math.max(from, position + 1),
          to: Math.min(to, position + node.nodeSize - 1),
        }
        if (range.from < range.to) textRanges.push(range)
        return false
      })
      // Ctrl/Cmd+A also selects the permanent empty caret line. Normalize a
      // single real text block so inline Markdown stays inside that paragraph.
      if (textRanges.length === 1) ({ from, to } = textRanges[0])
    }
    // Clicking the permanent empty caret paragraph can produce a structural
    // selection whose numeric range is non-empty even though it contains no
    // text. Treat it like a caret for toolbar placeholder behavior.
    const emptySelection = from === to || editor.state.doc.textBetween(from, to, '') === ''
    const nextSelection = emptySelection
      ? { from: from + open.length, to: from + open.length }
      : { from: from + open.length, to: to + open.length }
    const transaction = editor.state.tr
      .insert(to, editor.schema.text(close))
      .insert(from, editor.schema.text(open))
      .setStoredMarks([])
    transaction.setSelection(TextSelection.create(transaction.doc, nextSelection.from, nextSelection.to))
    transaction.setMeta(toolbarMarkdownMarkersKey, [
      { from, to: from + open.length },
      { from: to + open.length, to: to + open.length + close.length },
    ])
    if (emptySelection) transaction.setMeta(toolbarMarkdownCaretKey, nextSelection.from)
    // A toolbar click blurs the contenteditable before this transaction is
    // dispatched. Keep parsing paused through all synchronous appended
    // transactions, then resume after focus and caret state are stable.
    pauseDeferredMarkdown(editor, true)
    editor.view.focus()
    editor.view.dispatch(transaction.scrollIntoView())
    queueMicrotask(() => {
      if (!editor.isDestroyed) pauseDeferredMarkdown(editor, false)
    })
    onFormatApplied?.()
    // Mobile toolbar actions can switch the visible workspace panel during the
    // click. Restore the exact source selection after that layout change so
    // typing always lands between empty markers and selected text stays selected.
    const restoreSelection = () => {
      // Once an IME composition has started, the native selection belongs to
      // the browser. Moving it here can make iOS replace text at an old caret.
      if (editor.isDestroyed || richComposingRef.current || editor.view.composing || editor.state.doc !== transaction.doc) return
      const restore = editor.state.tr
      restore.setSelection(TextSelection.create(restore.doc, nextSelection.from, nextSelection.to))
      restore.setStoredMarks([]).setMeta('addToHistory', false)
      editor.view.dispatch(restore)
      editor.view.focus()
    }
    const requestFrame = editor.view.dom.ownerDocument.defaultView?.requestAnimationFrame
    if (requestFrame) requestFrame(() => {
      restoreSelection()
      // WebKit only makes the writing panel focusable after the next paint.
      // The follow-up may focus, but must never rewrite a live IME selection.
      requestFrame(() => {
        if (editor.isDestroyed || richComposingRef.current || editor.view.composing) return
        if (editor.view.dom.ownerDocument.activeElement !== editor.view.dom) editor.view.focus()
      })
    })
    else queueMicrotask(restoreSelection)
  }

  const applySyntax = (dialog: NonNullable<typeof syntaxDialog>, input: SyntaxDialogValue) => {
    if (!editor || disabled) return
    if (typeof dialog.nodePos === 'number') {
      editor.chain().focus().setNodeSelection(dialog.nodePos).updateAttributes('mathInline', { latex: input.primary }).run()
    } else if (dialog.kind === 'math-inline') {
      editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: input.primary } }).run()
    }
    onFormatApplied?.()
  }

  const insertSelectedBlock = (type: 'mathBlock' | 'mermaidBlock' | 'calloutBlock', attrs: Record<string, string>) => {
    if (!editor || disabled || mode !== 'rich') return
    editor.chain().focus().insertContent({ type, attrs }).run()
    const anchor = editor.state.selection.from
    let target = -1
    let distance = Number.POSITIVE_INFINITY
    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== type) return
      const nextDistance = Math.abs(position - anchor)
      if (nextDistance < distance) {
        target = position
        distance = nextDistance
      }
    })
    if (target >= 0) editor.commands.setNodeSelection(target)
    onFormatApplied?.()
  }

  const openCalloutDialog = (returnFocus: HTMLElement | null = calloutButtonRef.current) => {
    if (!editor || disabled || mode !== 'rich') return
    pauseDeferredMarkdown(editor, true)
    calloutReturnFocusRef.current = returnFocus
    setCalloutDialogOpen(true)
  }

  const closeCalloutDialog = () => {
    setCalloutDialogOpen(false)
    if (editor && !editor.isDestroyed) pauseDeferredMarkdown(editor, false)
  }

  const insertCallout = (kind: CalloutKind) => {
    insertSelectedBlock('calloutBlock', { kind, content: '' })
  }

  const insertFootnote = () => {
    if (!editor || disabled || mode !== 'rich') return
    const used = new Set(Array.from(editorMarkdown(editor).matchAll(/\[\^([^\]]+)\]/g), (match) => match[1]))
    let number = 1
    while (used.has(String(number))) number += 1
    const label = String(number)
    const reference = editor.schema.nodes.footnoteReference.create({ label })
    const definition = editor.schema.nodes.footnoteDefinition.create(undefined, editor.schema.text(`[^${label}]: `))
    const transaction = editor.state.tr.replaceSelectionWith(reference)
    const definitionPosition = transaction.doc.content.size
    transaction.insert(definitionPosition, definition)
    transaction.setSelection(TextSelection.create(transaction.doc, definitionPosition + definition.nodeSize - 1))
    editor.view.dispatch(transaction.scrollIntoView())
    editor.view.focus()
    onFormatApplied?.()
  }

  const slashCommand = (kind: 'heading' | 'quote' | 'code' | 'table' | 'footnote' | 'math-block' | 'callout' | 'mermaid') => {
    setSlashOpen(false)
    if (kind === 'heading') runFormat((chain) => chain.setHeading({ level: 2 }))
    else if (kind === 'quote') runFormat((chain) => chain.toggleBlockquote())
    else if (kind === 'code') runFormat((chain) => chain.toggleCodeBlock())
    else if (kind === 'table') setTableDialogOpen(true)
    else if (kind === 'footnote') insertFootnote()
    else if (kind === 'math-block') insertSelectedBlock('mathBlock', { latex: '' })
    else if (kind === 'callout') openCalloutDialog(editor?.view.dom ?? null)
    else insertSelectedBlock('mermaidBlock', { source: '' })
  }

  const runHistory = (direction: 'undo' | 'redo') => {
    if (!editor || disabled) return
    if (mode === 'source') {
      sourceRef.current?.[direction]()
      return
    }
    editor.chain().focus()[direction]().run()
  }

  const toolbar = <div className="editor-toolbar" data-editor-controls role="toolbar" aria-label="Markdown 格式">
      <div className="editor-tool-group" role="group" aria-label="文字样式">
        <h3>文字样式</h3>
        <button type="button" aria-pressed="false" disabled={disabled || mode === 'source' || !activeFormats?.canBold} onMouseDown={(event) => event.preventDefault()} onClick={() => runInlineFormat('**', '**')}>加粗</button>
        <button type="button" aria-pressed="false" disabled={disabled || mode === 'source' || !activeFormats?.canItalic} onMouseDown={(event) => event.preventDefault()} onClick={() => runInlineFormat('*', '*')}>斜体</button>
        <button type="button" aria-pressed="false" disabled={disabled || mode === 'source' || !activeFormats?.canStrike} onMouseDown={(event) => event.preventDefault()} onClick={() => runInlineFormat('~~', '~~')}>删除线</button>
        <button type="button" aria-pressed="false" disabled={disabled || mode === 'source' || !activeFormats?.canCode} onMouseDown={(event) => event.preventDefault()} onClick={() => runInlineFormat('`', '`')}>行内代码</button>
        <button type="button" aria-pressed="false" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => runInlineFormat('<mark>', '</mark>')}>高亮</button>
        <button type="button" aria-pressed="false" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => runInlineFormat('<sub>', '</sub>')}>下标</button>
        <button type="button" aria-pressed="false" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => runInlineFormat('<sup>', '</sup>')}>上标</button>
      </div>
      <div className="editor-tool-group" role="group" aria-label="段落结构">
        <h3>段落结构</h3>
        <button type="button" aria-pressed={mode === 'rich' && (activeFormats?.headingLevel ?? 0) === 0} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat((chain) => chain.setParagraph())}>正文</button>
        {([1, 2, 3, 4, 5, 6] as const).map((level) => <button key={level} type="button" aria-label={`H${level}`} aria-pressed={mode === 'rich' && activeFormats?.headingLevel === level} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat((chain) => chain.setHeading({ level }))}>H{level}</button>)}
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.bulletList)} disabled={disabled || mode === 'source' || !activeFormats?.canBulletList} onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat((chain) => chain.toggleBulletList())}>无序列表</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.orderedList)} disabled={disabled || mode === 'source' || !activeFormats?.canOrderedList} onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat((chain) => chain.toggleOrderedList())}>有序列表</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.taskList)} disabled={disabled || mode === 'source' || !activeFormats?.canTaskList} onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat((chain) => chain.toggleTaskList())}>任务列表</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.blockquote)} disabled={disabled || mode === 'source' || !activeFormats?.canBlockquote} onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat((chain) => chain.toggleBlockquote())}>引用</button>
      </div>
      <div className="editor-tool-group" role="group" aria-label="插入内容">
        <h3>插入内容</h3>
        <button ref={linkButtonRef} type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.link)} disabled={disabled || mode === 'source' || activeFormats?.codeBlock} onMouseDown={(event) => event.preventDefault()} onClick={openLinkDialog}>链接</button>
        <button type="button" aria-pressed={mode === 'rich' && Boolean(activeFormats?.codeBlock)} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat((chain) => chain.toggleCodeBlock())}>代码块</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => runFormat((chain) => chain.setHorizontalRule())}>分隔线</button>
        <button ref={tableButtonRef} type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => {
          if (!editor) return
          pauseDeferredMarkdown(editor, true)
          setTableDialogOpen(true)
        }}>表格</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={insertFootnote}>脚注</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => insertSelectedBlock('mathBlock', { latex: '' })}>公式块</button>
        <button ref={calloutButtonRef} type="button" aria-haspopup="dialog" aria-expanded={calloutDialogOpen} disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => openCalloutDialog()}>提示块</button>
        <button type="button" disabled={disabled || mode === 'source'} onMouseDown={(event) => event.preventDefault()} onClick={() => insertSelectedBlock('mermaidBlock', { source: '' })}>流程图</button>
      </div>
      </div>

  return <>
    {toolbarTarget ? createPortal(toolbar, toolbarTarget) : null}
    <section className="markdown-editor" data-mode={mode} data-font={font} data-focus-mode={focusMode || undefined} data-typewriter-mode={typewriterMode || undefined} aria-label="Markdown 编辑">
      {toolbarTarget === undefined ? toolbar : null}
      <div className="editor-status-bar">
        <div className="editor-status-actions">{statusActions}</div>
        <p className="editor-save-status" data-tone={statusTone} role="status">{status || '可以开始写作'}</p>
        <div className="editor-history-actions" role="group" aria-label="编辑历史">
          <button type="button" disabled={disabled || (mode === 'rich' ? !activeFormats?.canUndo : !sourceHistory.canUndo)} onMouseDown={(event) => event.preventDefault()} onClick={() => runHistory('undo')}>撤销</button>
          <button type="button" disabled={disabled || (mode === 'rich' ? !activeFormats?.canRedo : !sourceHistory.canRedo)} onMouseDown={(event) => event.preventDefault()} onClick={() => runHistory('redo')}>重做</button>
        </div>
      </div>
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
          : <Suspense fallback={<div className="editor-loading" role="status">正在加载源代码编辑器…</div>}><SourceMarkdownEditor ref={sourceRef} value={value} disabled={disabled} onChange={handleSourceChange} onHistoryStateChange={handleSourceHistoryChange} preparePastedImages={preparePastedImages} onCommitPastedImages={onCommitPastedImages} /></Suspense>}
      </div>
    </section>
    {tableDialogOpen && <TableDialog onClose={() => {
      setTableDialogOpen(false)
      if (editor && !editor.isDestroyed) pauseDeferredMarkdown(editor, false)
    }} onInsert={insertTable} returnFocus={() => tableButtonRef.current} />}
    {linkDialog && <LinkDialog initialHref={linkDialog.href} initialText={linkDialog.text} onClose={() => {
      setLinkDialog(null)
      if (editor && !editor.isDestroyed) pauseDeferredMarkdown(editor, false)
    }} onApply={applyLink} onRemove={removeLink} returnFocus={() => linkButtonRef.current} />}
    {syntaxDialog ? <SyntaxDialog kind={syntaxDialog.kind} initial={syntaxDialog.initial} onClose={() => {
      setSyntaxDialog(null)
      if (editor && !editor.isDestroyed) pauseDeferredMarkdown(editor, false)
    }} onSubmit={(input) => applySyntax(syntaxDialog, input)} returnFocus={() => syntaxButtonRef.current} /> : null}
    {calloutDialogOpen ? <CalloutDialog onClose={closeCalloutDialog} onInsert={insertCallout} returnFocus={() => calloutReturnFocusRef.current} /> : null}
    {slashOpen ? <AccessibleDialog title="快速插入" className="confirm-dialog slash-command-dialog" onClose={() => setSlashOpen(false)} returnFocus={() => editor?.view.dom ?? null}>
      <p>输入“/”可快速打开常用写作功能。</p>
      <div className="slash-command-list" role="list">
        <button type="button" onClick={() => slashCommand('heading')}>二级标题 <span>H2</span></button>
        <button type="button" onClick={() => slashCommand('quote')}>引用 <span>&gt;</span></button>
        <button type="button" onClick={() => slashCommand('code')}>代码块 <span>```</span></button>
        <button type="button" onClick={() => slashCommand('table')}>表格</button>
        <button type="button" onClick={() => slashCommand('footnote')}>脚注</button>
        <button type="button" onClick={() => slashCommand('math-block')}>公式块</button>
        <button type="button" onClick={() => slashCommand('callout')}>提示块</button>
        <button type="button" onClick={() => slashCommand('mermaid')}>Mermaid 图表</button>
      </div>
    </AccessibleDialog> : null}
  </>
})

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Selection, TextSelection } from '@tiptap/pm/state'
import katex from 'katex'

type SourceAttribute = 'latex' | 'source' | 'content' | 'description'
type EditableField = HTMLInputElement | HTMLTextAreaElement
const activeBlockEvent = 'imx-active-markdown-block'

let mermaidSequence = 0
let mermaidQueue: Promise<unknown> = Promise.resolve()

function renderMermaid(source: string, dark: boolean): Promise<string> {
  const task = mermaidQueue.then(async () => {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      fontFamily: 'var(--imx-font-ui)',
    })
    const { svg } = await mermaid.render(`imx-editor-mermaid-${Date.now()}-${mermaidSequence += 1}`, source)
    return svg
  })
  mermaidQueue = task.catch(() => undefined)
  return task
}

function useDocumentTheme(): 'light' | 'dark' {
  const read = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const [theme, setTheme] = useState<'light' | 'dark'>(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

function selectBlock({ editor, getPos }: Pick<ReactNodeViewProps, 'editor' | 'getPos'>): void {
  const position = getPos()
  if (typeof position === 'number') editor.commands.setNodeSelection(position)
}

function announceActiveBlock(root: HTMLElement | null): void {
  document.dispatchEvent(new CustomEvent(activeBlockEvent, { detail: root }))
}

function exitBlock({ editor, getPos, node }: Pick<ReactNodeViewProps, 'editor' | 'getPos' | 'node'>): void {
  const position = getPos()
  if (typeof position !== 'number') return
  const target = Math.min(position + node.nodeSize, editor.state.doc.content.size)
  editor.view.dispatch(editor.state.tr.setSelection(Selection.near(editor.state.doc.resolve(target), 1)))
}

function nearestTextCursor(doc: ProseMirrorNode, position: number): number | null {
  let nearestPosition: number | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  doc.descendants((node, nodePosition) => {
    if (!node.isTextblock) return true
    const start = nodePosition + 1
    const end = start + node.content.size
    const candidate = Math.max(start, Math.min(position, end))
    const distance = Math.abs(candidate - position)
    if (distance < nearestDistance) {
      nearestPosition = candidate
      nearestDistance = distance
    }
    return false
  })
  return nearestPosition
}

function deleteBlockAndRestoreCursor({ editor, getPos, node }: Pick<ReactNodeViewProps, 'editor' | 'getPos' | 'node'>): void {
  const position = getPos()
  if (typeof position !== 'number') return
  announceActiveBlock(null)
  let transaction = editor.state.tr.delete(position, position + node.nodeSize)
  let cursor = nearestTextCursor(transaction.doc, position)
  if (cursor === null) {
    const paragraph = editor.schema.nodes.paragraph
    if (paragraph) {
      const insertionPosition = Math.min(position, transaction.doc.content.size)
      transaction = transaction.insert(insertionPosition, paragraph.create())
      cursor = insertionPosition + 1
    }
  }
  if (cursor !== null) transaction = transaction.setSelection(TextSelection.create(transaction.doc, cursor))
  editor.view.dispatch(transaction.scrollIntoView())
  editor.view.focus()
}

function degradeBlockToPlainText(props: ReactNodeViewProps, raw: string, selectionOffset: number): void {
  const position = props.getPos()
  const paragraph = props.editor.schema.nodes.paragraph
  if (typeof position !== 'number' || !paragraph) return
  const lines = raw.split('\n')
  const nodes = lines.map((line) => paragraph.create(null, line ? props.editor.schema.text(line) : undefined))
  const safeOffset = Math.max(0, Math.min(selectionOffset, raw.length))
  let consumed = 0
  let cursor = position + 1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineEnd = consumed + line.length
    if (safeOffset <= lineEnd || index === lines.length - 1) {
      cursor = position + nodes.slice(0, index).reduce((size, node) => size + node.nodeSize, 0) + 1 + safeOffset - consumed
      break
    }
    consumed = lineEnd + 1
  }
  const transaction = props.editor.state.tr.replaceWith(position, position + props.node.nodeSize, nodes)
  transaction.setSelection(TextSelection.create(transaction.doc, cursor))
  announceActiveBlock(null)
  props.editor.view.dispatch(transaction.scrollIntoView())
  props.editor.view.focus()
}

function useBlockEditing(
  props: ReactNodeViewProps,
  rootRef: RefObject<HTMLElement | null>,
  inputRef: RefObject<EditableField | null>,
): boolean {
  const [locallyEditing, setLocallyEditing] = useState(false)
  const editing = locallyEditing || props.selected
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props }, [props])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const activate = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('textarea, input')) return
      event.preventDefault()
      announceActiveBlock(root)
      setLocallyEditing(true)
      selectBlock(propsRef.current)
    }
    const switchActive = (event: Event) => {
      if ((event as CustomEvent<HTMLElement | null>).detail !== root) setLocallyEditing(false)
    }
    root.addEventListener('pointerdown', activate, true)
    document.addEventListener(activeBlockEvent, switchActive)
    return () => {
      root.removeEventListener('pointerdown', activate, true)
      document.removeEventListener(activeBlockEvent, switchActive)
    }
  }, [rootRef])

  useEffect(() => {
    if (!editing) return
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current
      input?.focus({ preventScroll: true })
      const initialCaret = Number(input?.dataset.initialCaret)
      if (input && Number.isFinite(initialCaret)) input.setSelectionRange(initialCaret, initialCaret)
      else input?.select()
    })
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setLocallyEditing(false)
      if (propsRef.current.selected) exitBlock(propsRef.current)
    }
    document.addEventListener('pointerdown', closeOutside, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOutside, true)
    }
  }, [editing, inputRef, rootRef])
  return editing
}

function useSourceDraft(props: ReactNodeViewProps, attribute: SourceAttribute) {
  const source = String(props.node.attrs[attribute] ?? '')
  const [draft, setDraft] = useState(source)
  const composing = useRef(false)
  useEffect(() => {
    if (!composing.current) setDraft(source)
  }, [source])
  const change = (next: string) => {
    setDraft(next)
    if (!composing.current) props.updateAttributes({ [attribute]: next })
  }
  return {
    draft,
    change,
    compositionStart: () => { composing.current = true },
    compositionEnd: (next: string) => {
      composing.current = false
      setDraft(next)
      props.updateAttributes({ [attribute]: next })
    },
  }
}

function sourceKeyDown(event: ReactKeyboardEvent<EditableField>, props: ReactNodeViewProps): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    announceActiveBlock(null)
    exitBlock(props)
    props.editor.commands.focus()
    return
  }
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
  event.preventDefault()
  if (event.shiftKey) props.editor.commands.redo()
  else props.editor.commands.undo()
}

function resizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

function BlockSource({ props, attribute, label, placeholder, rows = 5, autoSize = false, showLabel = true, delimiter, inputRef, onEmptyDelete }: {
  props: ReactNodeViewProps
  attribute: SourceAttribute
  label: string
  placeholder?: string
  rows?: number
  autoSize?: boolean
  showLabel?: boolean
  delimiter?: string | { open: string; close: string }
  inputRef: RefObject<HTMLTextAreaElement | null>
  onEmptyDelete?: () => void
}) {
  const source = useSourceDraft(props, attribute)
  const openingDelimiter = typeof delimiter === 'string' ? delimiter : delimiter?.open
  const closingDelimiter = typeof delimiter === 'string' ? delimiter : delimiter?.close
  useLayoutEffect(() => {
    if (autoSize && inputRef.current) resizeTextarea(inputRef.current)
  }, [autoSize, inputRef, source.draft])
  return <label className="markdown-block-source">
    {showLabel ? <span className="markdown-block-source-label">{label}</span> : null}
    {openingDelimiter ? <span className="markdown-block-delimiter" aria-hidden="true">{openingDelimiter}</span> : null}
    <textarea
      ref={inputRef}
      aria-label={label}
      rows={autoSize ? 1 : rows}
      data-autosize={autoSize || undefined}
      spellCheck={false}
      placeholder={placeholder}
      value={source.draft}
      onChange={(event) => {
        source.change(event.currentTarget.value)
        if (autoSize) resizeTextarea(event.currentTarget)
      }}
      onCompositionStart={source.compositionStart}
      onCompositionEnd={(event) => source.compositionEnd(event.currentTarget.value)}
      onKeyDown={(event) => {
        if ((event.key === 'Backspace' || event.key === 'Delete') && event.currentTarget.value === '' && onEmptyDelete) {
          event.preventDefault()
          onEmptyDelete()
          return
        }
        sourceKeyDown(event, props)
      }}
    />
    {closingDelimiter ? <span className="markdown-block-delimiter" aria-hidden="true">{closingDelimiter}</span> : null}
  </label>
}

function DelimitedBlockSource({ props, attribute, label, open, close, parse, inputRef }: {
  props: ReactNodeViewProps
  attribute: 'latex' | 'source'
  label: string
  open: string
  close: string
  parse: (value: string) => string | undefined
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  const canonical = `${open}\n${String(props.node.attrs[attribute] ?? '')}\n${close}`
  const [draft, setDraft] = useState(canonical)
  const composing = useRef(false)
  useEffect(() => {
    if (!composing.current) setDraft(canonical)
  }, [canonical])
  useLayoutEffect(() => {
    if (inputRef.current) resizeTextarea(inputRef.current)
  }, [draft, inputRef])

  const update = (next: string, selectionOffset: number) => {
    setDraft(next)
    if (composing.current) return
    const parsed = parse(next)
    if (parsed === undefined) {
      degradeBlockToPlainText(props, next, selectionOffset)
      return
    }
    props.updateAttributes({ [attribute]: parsed })
  }

  return <label className="markdown-block-source markdown-delimited-source">
    <textarea
      ref={inputRef}
      aria-label={label}
      rows={1}
      data-autosize="true"
      data-initial-caret={open.length + 1}
      spellCheck={false}
      value={draft}
      onChange={(event) => {
        update(event.currentTarget.value, event.currentTarget.selectionStart)
        resizeTextarea(event.currentTarget)
      }}
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={(event) => {
        composing.current = false
        update(event.currentTarget.value, event.currentTarget.selectionStart)
      }}
      onKeyDown={(event) => sourceKeyDown(event, props)}
    />
  </label>
}

function imageMarkdown(props: ReactNodeViewProps): string {
  const alt = String(props.node.attrs.alt ?? '')
  const src = String(props.node.attrs.src ?? '')
  const title = String(props.node.attrs.title ?? '')
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
}

function parsedImageAttributes(props: ReactNodeViewProps, value: string): Record<string, unknown> | null {
  const markdown = props.editor.markdown
  if (!markdown) return null
  const parsed = markdown.parse(value)
  const only = parsed.content?.length === 1 ? parsed.content[0] : undefined
  const image = only?.type === 'image'
    ? only
    : only?.type === 'paragraph' && only.content?.length === 1 && only.content[0].type === 'image'
      ? only.content[0]
      : undefined
  return image?.attrs ?? null
}

function ImageBlockSource({ props, inputRef }: {
  props: ReactNodeViewProps
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  const canonical = imageMarkdown(props)
  const [draft, setDraft] = useState(canonical)
  const composing = useRef(false)
  useEffect(() => {
    if (!composing.current) setDraft(canonical)
  }, [canonical])
  useLayoutEffect(() => {
    if (inputRef.current) resizeTextarea(inputRef.current)
  }, [draft, inputRef])

  const update = (next: string, selectionOffset: number) => {
    setDraft(next)
    if (composing.current) return
    const attributes = parsedImageAttributes(props, next)
    if (!attributes) {
      degradeBlockToPlainText(props, next, selectionOffset)
      return
    }
    props.updateAttributes({
      src: attributes.src ?? '',
      alt: attributes.alt ?? '',
      title: attributes.title ?? null,
    })
  }

  return <label className="markdown-block-source markdown-image-source">
    <textarea
      ref={inputRef}
      aria-label="图片 Markdown 源码"
      rows={1}
      data-autosize="true"
      data-initial-caret="2"
      spellCheck={false}
      value={draft}
      onChange={(event) => {
        update(event.currentTarget.value, event.currentTarget.selectionStart)
        resizeTextarea(event.currentTarget)
      }}
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={(event) => {
        composing.current = false
        update(event.currentTarget.value, event.currentTarget.selectionStart)
      }}
      onKeyDown={(event) => sourceKeyDown(event, props)}
    />
  </label>
}

export function ImageBlockView(props: ReactNodeViewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editing = useBlockEditing(props, rootRef, inputRef)
  const src = String(props.node.attrs.src ?? '')
  const alt = String(props.node.attrs.alt ?? '')
  const title = String(props.node.attrs.title ?? '')
  return <NodeViewWrapper
    ref={rootRef}
    className="markdown-special-block image-block-view"
    data-editing={editing || undefined}
    data-image-block="true"
  >
    {editing ? <ImageBlockSource props={props} inputRef={inputRef} /> : null}
    <div className="markdown-block-preview image-block-preview" aria-label="图片预览">
      <img src={src} data-markdown-src={src} alt={alt} title={title || undefined} draggable={false} />
      <span className="image-block-missing" role="img" aria-label="图片文件已删除">
        <span className="image-block-missing-icon" aria-hidden="true" />
        <span>图片文件已删除</span>
      </span>
    </div>
  </NodeViewWrapper>
}

export function MathBlockView(props: ReactNodeViewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const latex = String(props.node.attrs.latex ?? '')
  const editing = useBlockEditing(props, rootRef, inputRef)
  const preview = useMemo(() => latex.trim()
    ? katex.renderToString(latex, { displayMode: true, throwOnError: false, strict: 'warn', trust: false })
    : '', [latex])
  return <NodeViewWrapper
    ref={rootRef}
    className="markdown-special-block math-block-view"
    data-editing={editing || undefined}
    data-math="block"
  >
    {editing ? <DelimitedBlockSource
      props={props}
      attribute="latex"
      label="LaTeX 源码"
      open="$$"
      close="$$"
      parse={(value) => value.match(/^\$\$\n([\s\S]*)\n\$\$$/)?.[1]}
      inputRef={inputRef}
    /> : null}
    <div className="markdown-block-preview math-block-preview" aria-label="公式预览">
      {preview ? <div dangerouslySetInnerHTML={{ __html: preview }} /> : <span className="math-block-empty">Empty Math Block</span>}
    </div>
  </NodeViewWrapper>
}

export function MermaidBlockView(props: ReactNodeViewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const source = String(props.node.attrs.source ?? '')
  const theme = useDocumentTheme()
  const [rendered, setRendered] = useState({ source: '', svg: '', error: '' })
  const editing = useBlockEditing(props, rootRef, inputRef)
  const currentRender = rendered.source === source ? rendered : { source, svg: '', error: '' }

  useEffect(() => {
    if (!source.trim()) return
    let active = true
    const timeout = window.setTimeout(() => {
      void renderMermaid(source, theme === 'dark').then((next) => {
        if (!active) return
        setRendered({ source, svg: next, error: '' })
      }).catch(() => {
        if (!active) return
        setRendered({ source, svg: '', error: '流程图源码暂时无法渲染' })
      })
    }, 100)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [source, theme])

  return <NodeViewWrapper
    ref={rootRef}
    className="markdown-special-block mermaid-block-view"
    data-editing={editing || undefined}
  >
    {editing ? <DelimitedBlockSource
      props={props}
      attribute="source"
      label="Mermaid 源码"
      open="```mermaid"
      close="```"
      parse={(value) => value.match(/^```mermaid\n([\s\S]*)\n```$/i)?.[1]}
      inputRef={inputRef}
    /> : null}
    <div className="markdown-block-preview mermaid-block-preview" aria-label="Mermaid 流程图">
      {source.trim() && currentRender.svg ? <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: currentRender.svg }} /> : <span className="mermaid-block-empty">Empty Mermaid Block</span>}
      {source.trim() && currentRender.error ? <small role="status">{currentRender.error}</small> : null}
    </div>
  </NodeViewWrapper>
}

const calloutLabels: Record<string, { label: string; icon: string }> = {
  NOTE: { label: '提醒内容', icon: '●' },
  TIP: { label: '建议内容', icon: '✦' },
  IMPORTANT: { label: '重要内容', icon: '★' },
  WARNING: { label: '警告内容', icon: '⚠' },
  CAUTION: { label: '注意内容', icon: 'ⓘ' },
}

export function CalloutBlockView(props: ReactNodeViewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const kind = String(props.node.attrs.kind ?? 'NOTE').toUpperCase()
  const content = String(props.node.attrs.content ?? '')
  const meta = calloutLabels[kind] ?? calloutLabels.NOTE
  const editing = useBlockEditing(props, rootRef, inputRef)
  return <NodeViewWrapper
    ref={rootRef}
    className="markdown-special-block callout-block-view"
    data-callout={kind.toLowerCase()}
    data-editing={editing || undefined}
  >
    <div className="callout-block-title"><span aria-hidden="true">{meta.icon}</span>{meta.label}</div>
    {editing
      ? <BlockSource
        props={props}
        attribute="content"
        label={`${meta.label}正文`}
        placeholder="在此输入内容"
        autoSize
        inputRef={inputRef}
        onEmptyDelete={() => deleteBlockAndRestoreCursor(props)}
      />
      : <p>{content || '在此输入内容'}</p>}
  </NodeViewWrapper>
}

export function FootnoteDefinitionView(props: ReactNodeViewProps) {
  const emptyDescription = /^\[\^[^\]\n]+\]:[ \t]*$/.test(props.node.textContent)
  const placeCaretAtEnd = (event: ReactMouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest('.footnote-definition-placeholder')) return
    event.preventDefault()
    const position = props.getPos()
    if (typeof position !== 'number') return
    props.editor.chain().focus().setTextSelection(position + props.node.nodeSize - 1).run()
  }
  return <NodeViewWrapper
    className="markdown-special-block footnote-definition-view"
    data-empty-description={emptyDescription || undefined}
    onMouseDown={placeCaretAtEnd}
  >
    <NodeViewContent className="footnote-definition-content" />
    {emptyDescription ? <span className="footnote-definition-placeholder" aria-hidden="true">在此输入描述</span> : null}
  </NodeViewWrapper>
}

export function FootnoteReferenceView(props: ReactNodeViewProps) {
  const label = String(props.node.attrs.label ?? '1')
  const [, renderTransaction] = useReducer((revision: number) => revision + 1, 0)
  useEffect(() => {
    const update = () => renderTransaction()
    props.editor.on('transaction', update)
    return () => { props.editor.off('transaction', update) }
  }, [props.editor])
  let description = ''
  let definitionPosition = -1
  props.editor.state.doc.descendants((node, position) => {
    const match = node.type.name === 'footnoteDefinition' ? node.textContent.match(/^\[\^([^\]\n]+)\]:[ \t]*(.*)$/) : null
    if (definitionPosition >= 0 || !match || match[1] !== label) return
    definitionPosition = position
    description = match[2]
  })
  const hint = description || `脚注 ${label}`
  const jumpToDefinition = () => {
    if (definitionPosition < 0) return
    const definitionNode = props.editor.state.doc.nodeAt(definitionPosition)
    if (!definitionNode) return
    props.editor.chain().focus().setTextSelection(definitionPosition + definitionNode.nodeSize - 1).run()
    const definition = props.editor.view.nodeDOM(definitionPosition)
    if (definition instanceof HTMLElement && typeof definition.scrollIntoView === 'function') {
      definition.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
  return <NodeViewWrapper
    className="footnote-reference-view"
    data-label={label}
    data-description={hint}
    role="link"
    tabIndex={0}
    aria-label={`脚注 ${label}：${hint}`}
    onMouseDown={(event: ReactMouseEvent) => event.preventDefault()}
    onClick={jumpToDefinition}
    onKeyDown={(event: ReactKeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      jumpToDefinition()
    }}
  >[^{label}]</NodeViewWrapper>
}

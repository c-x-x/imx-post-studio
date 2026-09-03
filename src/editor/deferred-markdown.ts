import { Extension, type Editor, type JSONContent } from '@tiptap/core'
import type {} from '@tiptap/markdown'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { isHistoryTransaction } from '@tiptap/pm/history'
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

interface DeferredState {
  pending: Set<number>
  literals: DecorationSet
  toolbarMarkers: DecorationSet
  toolbarCaret: number | null
  paused: boolean
  revealed: RevealedInlineSource | null
}
type InlineSourceKind = 'bold' | 'italic' | 'strike' | 'code' | 'highlight' | 'subscript' | 'superscript' | 'math'
interface RevealedInlineSource { block: number; from: number; to: number; kind: InlineSourceKind }
const pendingKey = new PluginKey<DeferredState>('deferredMarkdown')
const pauseKey = 'deferredMarkdownPaused'
const revealKey = 'deferredMarkdownReveal'
export const toolbarMarkdownMarkersKey = 'deferredMarkdownToolbarMarkers'
export const toolbarMarkdownCaretKey = 'deferredMarkdownToolbarCaret'
const consumeToolbarCaretKey = 'deferredMarkdownConsumeToolbarCaret'
const blockPrefix = /^(?:#{1,6}\s|>\s|[-+*]\s|\d+[.)]\s)/

// Parsed text has already lost its Markdown escapes. Remember its literal
// punctuation, independently of new characters typed into the same text node.
function literalMarkers(doc: ProseMirrorNode, from = 0, to = doc.content.size): Decoration[] {
  const markers: Decoration[] = []
  doc.nodesBetween(from, to, (node, position) => {
    if (!canInterpretText(node)) return
    for (const match of (node.text ?? '').matchAll(/[\\*_~`$[\]#>+.\-!()]/g)) {
      const start = position + match.index
      markers.push(Decoration.inline(start, start + 1, {}))
    }
  })
  return markers
}

/** Dialogs retain the editor selection until their operation is applied. */
export function pauseDeferredMarkdown(editor: Editor, paused: boolean): void {
  editor.view.dispatch(editor.state.tr.setMeta(pauseKey, paused))
}

function rawText(child: ProseMirrorNode, position: number, literals: DecorationSet | undefined): string {
  const protectedPositions = new Set(literals?.find(position, position + child.nodeSize).map((marker) => marker.from))
  return (child.text ?? '').split('').map((character, index) => {
    if (protectedPositions.has(position + index)) return `\\${character}`
    return character === '&' ? '&amp;' : character === '<' ? '&lt;' : character === '>' ? '&gt;' : character
  }).join('').replace(/&lt;(\/?(?:mark|sub|sup))&gt;/g, '<$1>')
}

function canInterpretText(node: ProseMirrorNode): boolean {
  return node.isText && node.marks.every((mark) => ['bold', 'italic', 'strike'].includes(mark.type.name))
}

function textblockPosition(state: EditorState): number | null {
  const { $from } = state.selection
  return $from.depth > 0 && $from.parent.isTextblock ? $from.before() : null
}

function canDefer(node: ProseMirrorNode | null): boolean {
  if (!node || !['paragraph', 'heading'].includes(node.type.name)) return false
  let syntax = blockPrefix.test(node.textContent)
  node.forEach((child) => {
    if (canInterpretText(child) && /[*_~`$[<]/.test(child.text ?? '')) syntax = true
  })
  return syntax
}

function introducesSyntax(before: string, after: string): boolean {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1
  let end = after.length
  let oldEnd = before.length
  while (end > start && oldEnd > start && after[end - 1] === before[oldEnd - 1]) { end -= 1; oldEnd -= 1 }
  return /[*_~`$[\]<]/.test(after.slice(start, end)) || (blockPrefix.test(after) && !blockPrefix.test(before))
}

// Retain inherited styles without escaping newly typed inline Markdown.
function markedTextMarkdown(editor: Editor, child: ProseMirrorNode, position: number, literals: DecorationSet | undefined): string {
  const raw = rawText(child, position, literals)
  const parsed = editor.schema.nodeFromJSON(editor.markdown!.parse(raw))
  if (parsed.childCount !== 1 || parsed.firstChild?.type.name !== 'paragraph') {
    return editor.markdown!.serialize({ type: 'paragraph', content: [child.toJSON()] })
  }
  const content: JSONContent[] = []
  parsed.firstChild.forEach((node) => {
    const marks = child.marks.reduce((set, mark) => mark.addToSet(set), node.marks)
    content.push(node.mark(marks).toJSON())
  })
  return editor.markdown!.serialize({ type: 'paragraph', content })
}

// Code, links and images keep their existing content when a line is committed.
function lineMarkdown(editor: Editor, node: ProseMirrorNode, position: number, literals = pendingKey.getState(editor.state)?.literals): string {
  let text = ''
  node.forEach((child, offset) => {
    if (child.isText && child.marks.length === 0) {
      text += rawText(child, position + 1 + offset, literals)
    } else if (canInterpretText(child) && /[*_~`$[]/.test(child.text ?? '')) {
      text += markedTextMarkdown(editor, child, position + 1 + offset, literals)
    } else if (child.type.name === 'hardBreak') {
      text += '  \n'
    } else {
      text += editor.markdown!.serialize({ type: 'paragraph', content: [child.toJSON()] })
    }
  })
  // A leading quote marker is syntax, but embedded HTML remains literal text.
  if (node.type.name === 'paragraph') return text.replace(/^&gt;(?=\s)/, '>')
  return `${'#'.repeat(Number(node.attrs.level))} ${text}`
}

function childMatchesInlineKind(child: ProseMirrorNode, kind: InlineSourceKind): boolean {
  if (kind === 'math') return child.type.name === 'mathInline'
  const markNames: Record<Exclude<InlineSourceKind, 'math'>, string> = {
    bold: 'bold',
    italic: 'italic',
    strike: 'strike',
    code: 'code',
    highlight: 'textHighlight',
    subscript: 'subscript',
    superscript: 'superscript',
  }
  return child.marks.some((mark) => mark.type.name === markNames[kind])
}

function inlineKindAtSelection(state: EditorState): InlineSourceKind | null {
  if (!state.selection.empty) return null
  const markKinds: Array<[string, InlineSourceKind]> = [
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['strike', 'strike'],
    ['code', 'code'],
    ['textHighlight', 'highlight'],
    ['subscript', 'subscript'],
    ['superscript', 'superscript'],
  ]
  const marks = state.selection.$from.marks()
  const marked = markKinds.find(([name]) => marks.some((mark) => mark.type.name === name))
  if (marked) return marked[1]
  const { nodeBefore, nodeAfter } = state.selection.$from
  return nodeBefore?.type.name === 'mathInline' || nodeAfter?.type.name === 'mathInline' ? 'math' : null
}

function inlineRevealTransaction(editor: Editor, state: EditorState, position: number, kind: InlineSourceKind): Transaction | null {
  const $position = state.doc.resolve(position)
  let depth = $position.depth
  while (depth > 0 && !$position.node(depth).isTextblock) depth -= 1
  if (depth === 0) return null
  const block = $position.before(depth)
  const node = $position.node(depth)
  if (!['paragraph', 'heading'].includes(node.type.name) || pendingKey.getState(state)?.pending.has(block)) return null

  const literals = pendingKey.getState(state)?.literals
  let source = ''
  let selected: { from: number; to: number; caret: number } | null = null
  node.forEach((child, offset) => {
    const childPosition = block + 1 + offset
    const segment = child.isText && child.marks.length === 0
      ? rawText(child, childPosition, literals)
      : child.type.name === 'hardBreak'
        ? '  \n'
        : editor.markdown!.serialize({ type: 'paragraph', content: [child.toJSON()] })
    const segmentStart = source.length
    source += segment
    const containsClick = position >= childPosition && position <= childPosition + child.nodeSize
    if (!containsClick || !childMatchesInlineKind(child, kind)) return
    const contentIndex = child.text ? Math.max(0, segment.indexOf(child.text)) : 0
    const textOffset = child.isText ? Math.max(0, Math.min(child.text?.length ?? 0, position - childPosition)) : 0
    selected = {
      from: segmentStart,
      to: segmentStart + segment.length,
      caret: child.type.name === 'mathInline'
        ? segmentStart + Math.max(1, segment.length - 1)
        : position === childPosition + child.nodeSize
          ? segmentStart + segment.length
        : segmentStart + contentIndex + textOffset,
    }
  })
  if (!source || !selected) return null
  const selectedSource = selected as { from: number; to: number; caret: number }
  if (selectedSource.to <= selectedSource.from) return null

  const from = block + 1
  const transaction = state.tr.replaceWith(from, block + node.nodeSize - 1, state.schema.text(source))
  const revealed = {
    block,
    from: from + selectedSource.from,
    to: from + selectedSource.to,
    kind,
  }
  transaction.setSelection(TextSelection.create(transaction.doc, from + selectedSource.caret))
  transaction.setMeta(revealKey, revealed)
  return transaction.scrollIntoView()
}

function revealSourceAtSelection(editor: Editor, state: EditorState, position: number, kind?: InlineSourceKind): Transaction | null {
  const resolvedKind = kind ?? inlineKindAtSelection(state)
  return resolvedKind ? inlineRevealTransaction(editor, state, position, resolvedKind) : null
}

function revealInlineSource(editor: Editor, position: number, kind: InlineSourceKind): boolean {
  const transaction = revealSourceAtSelection(editor, editor.state, position, kind)
  if (!transaction) return false
  editor.view.dispatch(transaction)
  return true
}

function completeRevealedSyntax(state: EditorState, revealed: RevealedInlineSource): boolean {
  const source = state.doc.textBetween(revealed.from, revealed.to, '')
  const patterns: Record<InlineSourceKind, RegExp> = {
    bold: /^\*\*[\s\S]+\*\*$/,
    italic: /^\*[\s\S]+\*$/,
    strike: /^~~[\s\S]+~~$/,
    code: /^(`+)[\s\S]+\1$/,
    highlight: /^<mark>[\s\S]+<\/mark>$/,
    subscript: /^<sub>[\s\S]+<\/sub>$/,
    superscript: /^<sup>[\s\S]+<\/sup>$/,
    math: /^\$(?!\$)[^\n$]+\$$/,
  }
  return patterns[revealed.kind].test(source)
}

/** Save the typed source, not the serializer's escaped literal asterisks. */
export function editorMarkdown(editor: Editor): string {
  const pending = pendingKey.getState(editor.state)?.pending
  if (!editor.markdown) return editor.getMarkdown()
  const trailingCaretLine = editor.state.doc.lastChild?.type.name === 'paragraph'
    && editor.state.doc.lastChild.content.size === 0
  if (!pending?.size) {
    const json = editor.state.doc.toJSON() as JSONContent
    if (trailingCaretLine && json.content?.length) json.content.pop()
    return editor.markdown.serialize(json)
  }
  const serialize = (node: ProseMirrorNode, position: number): JSONContent => {
    if (pending.has(position)) return { type: 'rawMarkdownBlock', attrs: { raw: lineMarkdown(editor, node, position) } }
    const json = node.toJSON() as JSONContent
    if (node.childCount) {
      json.content = []
      node.forEach((child, offset, index) => {
        if (node === editor.state.doc && trailingCaretLine && index === node.childCount - 1) return
        json.content!.push(serialize(child, position + 1 + offset))
      })
    }
    return json
  }
  return editor.markdown.serialize(serialize(editor.state.doc, -1))
}

export const DeferredMarkdown = Extension.create({
  name: 'deferredMarkdown',
  priority: 1000,
  addProseMirrorPlugins() {
    const editor = this.editor
    let composing = false
    let blurred = false
    let revealAfterCommit = false
    let revealScheduled = false
    const insertAtToolbarCaret = (view: EditorView, from: number, text: string) => {
      const deferred = pendingKey.getState(view.state)
      if (!deferred || deferred.toolbarCaret === null) return false
      const caret = deferred.toolbarCaret
      const closingMarker = deferred.toolbarMarkers.find()
        .find((marker) => marker.from === caret && marker.to > marker.from)
      if (from !== caret && from !== closingMarker?.to) return false
      const transaction = view.state.tr.insertText(text, caret, caret)
      transaction.setSelection(TextSelection.create(transaction.doc, caret + text.length))
      // Keep the logical insertion position for the whole toolbar-authored
      // source without adding a DOM widget, which would split an IME's
      // composition range between adjacent marker decorations.
      transaction.setMeta(toolbarMarkdownCaretKey, caret + text.length)
      view.dispatch(transaction.scrollIntoView())
      return true
    }
    return [new Plugin<DeferredState>({
      key: pendingKey,
      state: {
        init: (_, state) => ({
          pending: new Set(),
          literals: DecorationSet.create(state.doc, literalMarkers(state.doc)),
          toolbarMarkers: DecorationSet.empty,
          toolbarCaret: null,
          paused: false,
          revealed: null,
        }),
        apply(transaction, previous, oldState, nextState) {
          // Source-mode/import replacements are already parsed Markdown. Do not
          // reinterpret intentionally escaped literal markers as newly typed syntax.
          if (transaction.getMeta('preventUpdate') !== undefined) return {
            pending: new Set(),
            literals: DecorationSet.create(nextState.doc, literalMarkers(nextState.doc)),
            toolbarMarkers: DecorationSet.empty,
            toolbarCaret: null,
            paused: false,
            revealed: null,
          }
          const pending = new Set<number>()
          const committed = transaction.getMeta(pendingKey) as number[] | undefined
          let literals = previous.literals.map(transaction.mapping, nextState.doc)
          let toolbarMarkers = committed
            ? DecorationSet.empty
            : previous.toolbarMarkers.map(transaction.mapping, nextState.doc)
          let toolbarCaret = previous.toolbarCaret
          if (toolbarCaret !== null) {
            const mapped = transaction.mapping.mapResult(toolbarCaret, 1)
            toolbarCaret = mapped.deleted ? null : mapped.pos
          }
          const addedToolbarCaret = transaction.getMeta(toolbarMarkdownCaretKey) as number | undefined
          if (typeof addedToolbarCaret === 'number') toolbarCaret = addedToolbarCaret
          if (transaction.getMeta(consumeToolbarCaretKey)) toolbarCaret = null
          const addedToolbarMarkers = transaction.getMeta(toolbarMarkdownMarkersKey) as Array<{ from: number; to: number }> | undefined
          if (addedToolbarMarkers?.length) {
            toolbarMarkers = toolbarMarkers.add(nextState.doc, addedToolbarMarkers.map(({ from, to }) =>
              Decoration.inline(from, to, { class: 'editor-toolbar-markdown-marker' })))
          }
          if (committed) {
            for (const position of committed) {
              const from = transaction.mapping.map(position, -1)
              const node = nextState.doc.nodeAt(from)
              if (node) {
                literals = literals.remove(literals.find(from, from + node.nodeSize))
                  .add(nextState.doc, literalMarkers(nextState.doc, from, from + node.nodeSize))
              }
            }
          }
          for (const position of previous.pending) {
            if (committed?.includes(position)) continue
            const mapped = transaction.mapping.mapResult(position, 1)
            if (!mapped.deleted && canDefer(nextState.doc.nodeAt(mapped.pos))) pending.add(mapped.pos)
          }
          if (transaction.docChanged && !committed) {
            const before = textblockPosition(oldState)
            const after = textblockPosition(nextState)
            const candidates = [after, before === null ? null : transaction.mapping.map(before, -1)]
            for (const position of candidates) {
              const node = position === null ? null : nextState.doc.nodeAt(position)
              if (position !== null && node && canDefer(node) &&
                introducesSyntax(oldState.selection.$from.parent.textContent, node.textContent)) pending.add(position)
            }
          }
          let revealed = previous.revealed
          if (revealed) {
            const mappedBlock = transaction.mapping.mapResult(revealed.block, 1)
            revealed = mappedBlock.deleted ? null : {
              block: mappedBlock.pos,
              from: transaction.mapping.map(revealed.from, 1),
              to: transaction.mapping.map(revealed.to, -1),
              kind: revealed.kind,
            }
          }
          const nextReveal = transaction.getMeta(revealKey) as RevealedInlineSource | undefined
          if (nextReveal) {
            revealed = nextReveal
            pending.add(nextReveal.block)
          }
          if (revealed && (committed?.includes(revealed.block) || !pending.has(revealed.block))) revealed = null
          return { pending, literals, toolbarMarkers, toolbarCaret, paused: transaction.getMeta(pauseKey) ?? previous.paused, revealed }
        },
      },
      appendTransaction(transactions, _oldState, state) {
        if (composing || editor.view.composing || pendingKey.getState(state)?.paused || transactions.some(isHistoryTransaction)) return null
        const toolbarState = pendingKey.getState(state)
        const activeBlock = textblockPosition(state)
        const activeNode = activeBlock === null ? null : state.doc.nodeAt(activeBlock)
        const editingToolbarSource = activeBlock !== null && activeNode
          ? toolbarState?.toolbarMarkers.find(activeBlock, activeBlock + activeNode.nodeSize).length
          : 0
        if (editingToolbarSource) return null
        // Toolbar markers must remain literal while the user types between
        // them. A toolbar click temporarily blurs the editor, so committing
        // this same insertion transaction would erase the stored caret before
        // focus can return.
        if (transactions.some((transaction) => transaction.getMeta(toolbarMarkdownMarkersKey))) return null
        if (transactions.some((transaction) => transaction.getMeta(pendingKey))) {
          if (!blurred && !pendingKey.getState(state)?.revealed && state.selection.empty) {
            return revealSourceAtSelection(editor, state, state.selection.from)
          }
          return null
        }
        const canRevealSelection = !blurred && !pendingKey.getState(state)?.revealed && state.selection.empty
        if (canRevealSelection && transactions.some((transaction) => transaction.selectionSet && !transaction.docChanged)) {
          const revealed = revealSourceAtSelection(editor, state, state.selection.from)
          if (revealed) return revealed
        }
        // A formatting button owns the interaction even though the browser's
        // focus transition can report the editor as blurred. Keep its marker
        // line active until the selection actually moves away.
        const hasToolbarMarkers = Boolean(toolbarState?.toolbarMarkers.find().length)
        const active = blurred && !hasToolbarMarkers ? null : textblockPosition(state)
        const pending = pendingKey.getState(state)?.pending
        if (!pending?.size || !editor.markdown) return null
          const transaction = state.tr
          const committed: number[] = []
          let restoredImagePosition: number | null = null
          // Back-to-front replacements leave the remaining block positions stable.
          for (const position of [...pending].sort((a, b) => b - a)) {
            const revealed = pendingKey.getState(state)?.revealed
            const insideRevealedSource = revealed?.block === position
              && state.selection.from >= revealed.from && state.selection.to <= revealed.to
            if (revealed?.block === position && !completeRevealedSyntax(state, revealed)) continue
            const node = state.doc.nodeAt(position)
            if (!node || !canDefer(node)) continue
            const markdown = lineMarkdown(editor, node, position, pendingKey.getState(state)?.literals)
            // Four adjacent asterisks are the editor's empty bold source. CommonMark
            // also accepts them as a thematic break, so keep this exact source
            // editable instead of turning it into a horizontal rule on blur/tap.
            if (markdown === '****') continue
            const parsed = editor.schema.nodeFromJSON(editor.markdown.parse(markdown))
            const restoresStandaloneImage = parsed.childCount === 1 && parsed.firstChild?.type.name === 'image'
            // Ordinary inline syntax remains visible until the caret leaves its
            // line. A repaired standalone image is different: it was an image
            // block immediately before its syntax was broken, so restore it as
            // soon as the closing marker makes the whole line valid again.
            if (position === active && (!revealed || insideRevealedSource) && !restoresStandaloneImage) continue
            const $position = state.doc.resolve(position)
            if (!$position.parent.canReplace($position.index(), $position.index() + 1, parsed.content)) continue
            if (!parsed.content.eq(state.doc.content.cut(position, position + node.nodeSize))) {
              committed.push(position)
              transaction.replaceWith(position, position + node.nodeSize, parsed.content)
              if (position === active && restoresStandaloneImage) restoredImagePosition = position
            }
          }
          if (!committed.length) return null
          if (restoredImagePosition !== null) {
            const imagePosition = transaction.mapping.map(restoredImagePosition, -1)
            const image = transaction.doc.nodeAt(imagePosition)
            if (image?.type.name === 'image') {
              transaction.setSelection(Selection.near(transaction.doc.resolve(imagePosition + image.nodeSize), 1))
            }
          }
          revealAfterCommit = true
          return transaction.setMeta(pendingKey, committed)
      },
      view() {
        return {
          update(view) {
            if (!revealAfterCommit || revealScheduled) return
            revealAfterCommit = false
            if (blurred || pendingKey.getState(view.state)?.revealed || !view.state.selection.empty) return
            revealScheduled = true
            queueMicrotask(() => {
              revealScheduled = false
              if (view.isDestroyed || blurred || pendingKey.getState(view.state)?.revealed || !view.state.selection.empty) return
              const transaction = revealSourceAtSelection(editor, view.state, view.state.selection.from)
              if (transaction) view.dispatch(transaction)
            })
          },
        }
      },
      props: {
        handleTextInput(view, from, _to, text) {
          return insertAtToolbarCaret(view, from, text)
        },
        handleClick(view, position, event) {
          const target = event.target instanceof Element
            ? event.target.closest('strong, em, s, code, mark, sub, sup, [data-math="inline"]')
            : null
          if (!target || !view.dom.contains(target) || (target.matches('code') && target.closest('pre'))) return false
          const kinds: Record<string, InlineSourceKind> = {
            STRONG: 'bold', EM: 'italic', S: 'strike', CODE: 'code', MARK: 'highlight',
            SUB: 'subscript', SUP: 'superscript',
          }
          const kind = target.matches('[data-math="inline"]') ? 'math' : kinds[target.tagName]
          return kind ? revealInlineSource(editor, position, kind) : false
        },
        handleKeyDown(view, event) {
          if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || composing || view.composing) return false
          const state = view.state
          const { $from } = state.selection
          const deferred = pendingKey.getState(state)
          const closingToolbarMarker = state.selection.empty
            ? deferred?.toolbarMarkers.find(state.selection.from, $from.end())
              .find((marker) => marker.from === state.selection.from && marker.to > marker.from)
            : undefined
          if (closingToolbarMarker) {
            view.dispatch(view.state.tr
              .setMeta(consumeToolbarCaretKey, true)
              .setMeta('addToHistory', false))
            return editor.chain()
              .setTextSelection(closingToolbarMarker.to)
              .splitBlock()
              .run()
          }
          const ancestors = Array.from({ length: $from.depth + 1 }, (_, depth) => $from.node(depth).type.name)
          const activeInlineStyle = ['bold', 'italic', 'strike', 'code'].some((mark) => editor.isActive(mark))
          const listItem = ancestors.includes('taskItem') ? 'taskItem' : ancestors.includes('listItem') ? 'listItem' : null
          const inTable = ancestors.some((name) => name === 'tableCell' || name === 'tableHeader')
          // Inline toolbar styles describe the current text, not the next paragraph.
          // Split ordinary paragraphs/headings here so the new caret has no stored marks;
          // Structural blocks keep their native split command, but the new text
          // position still starts without toolbar-applied inline styles.
          if (state.selection.empty && activeInlineStyle && listItem) {
            return editor.chain().splitListItem(listItem).command(({ tr }) => {
              tr.setStoredMarks([])
              return true
            }).run()
          }
          if (state.selection.empty && activeInlineStyle && inTable) {
            return editor.chain().splitBlock().command(({ tr }) => {
              tr.setStoredMarks([])
              return true
            }).run()
          }
          if (state.selection.empty && !ancestors.includes('codeBlock')
            && ['paragraph', 'heading'].includes($from.parent.type.name)
            && activeInlineStyle) {
            return editor.chain().splitBlock().command(({ tr }) => {
              tr.setStoredMarks([])
              return true
            }).run()
          }
          const position = textblockPosition(state)
          if (position === null || deferred?.paused || !deferred?.pending.has(position) || !editor.markdown || !state.selection.empty) return false
          const node = state.doc.nodeAt(position)!
          if (state.selection.$from.parentOffset !== node.content.size) return false
          const parsed = editor.schema.nodeFromJSON(editor.markdown.parse(lineMarkdown(editor, node, position)))
          if (parsed.childCount !== 1 || !['bulletList', 'orderedList', 'taskList', 'blockquote'].includes(parsed.firstChild!.type.name)) return false
          const $position = state.doc.resolve(position)
          if (!$position.parent.canReplace($position.index(), $position.index() + 1, parsed.content)) return false
          // Convert first, then let the native list/quote Enter commands continue
          // the structure. Both operations share one transaction/undo step.
          const chain = editor.chain().command(({ tr }) => {
            tr.replaceWith(position, position + node.nodeSize, parsed.content)
            tr.setSelection(TextSelection.near(tr.doc.resolve(position + parsed.content.size - 2), -1))
            tr.setMeta(pendingKey, [position])
            return true
          })
          return parsed.firstChild!.type.name === 'blockquote'
            ? chain.splitBlock().run()
            : chain.splitListItem(parsed.firstChild!.type.name === 'taskList' ? 'taskItem' : 'listItem').run()
        },
        decorations(state) {
          const deferred = pendingKey.getState(state)
          const toolbarDecorations: Decoration[] = deferred?.toolbarMarkers.find() ?? []
          const position = textblockPosition(state)
          if (position === null || !deferred?.pending.has(position)) {
            return toolbarDecorations.length ? DecorationSet.create(state.doc, toolbarDecorations) : null
          }
          const node = state.doc.nodeAt(position)
          if (!node) return toolbarDecorations.length ? DecorationSet.create(state.doc, toolbarDecorations) : null
          const decorations: Decoration[] = []
          node.forEach((child, offset) => {
            if (!canInterpretText(child)) return
            for (const match of (child.text ?? '').matchAll(/(?<!\\)(?:^#{1,6}(?=\s)|[*_~`$]+|<\/?(?:mark|sub|sup)>|[[\]])/g)) {
              const from = position + 1 + offset + match.index
              decorations.push(Decoration.inline(from, from + match[0].length, { class: 'editor-markdown-marker' }))
            }
          })
          return DecorationSet.create(state.doc, [
            ...decorations,
            ...toolbarDecorations,
          ])
        },
        handleDOMEvents: {
          beforeinput(view, event) {
            const input = event as InputEvent
            if (input.isComposing || input.inputType !== 'insertText' || !input.data) return false
            if (!insertAtToolbarCaret(view, view.state.selection.from, input.data)) return false
            event.preventDefault()
            return true
          },
          focus() { blurred = false; return false },
          blur(view, event) {
            // Formatting controls are part of editing, not a request to parse
            // the active line. Replacing that line here collapses its selection
            // before the toolbar command can use it. Some browsers omit the
            // related target, so preserve non-empty selections in that case too.
            const target = (event as FocusEvent).relatedTarget
            blurred = (view.state.selection.empty || Boolean(pendingKey.getState(view.state)?.paused))
              && !(target instanceof Element && target.closest('[data-editor-controls]'))
            view.dispatch(view.state.tr.setMeta('deferredMarkdownBlur', true))
            return false
          },
          compositionstart() { composing = true; return false },
          compositionend(view) {
            composing = false
            // Let the browser finish its IME transaction before updating decorations.
            requestAnimationFrame(() => {
              if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta('compositionFinished', true))
            })
            return false
          },
        },
      },
    })]
  },
})

import { Extension, type Editor, type JSONContent } from '@tiptap/core'
import type {} from '@tiptap/markdown'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { isHistoryTransaction } from '@tiptap/pm/history'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

interface DeferredState {
  pending: Set<number>
  literals: DecorationSet
  paused: boolean
}
const pendingKey = new PluginKey<DeferredState>('deferredMarkdown')
const pauseKey = 'deferredMarkdownPaused'
const blockPrefix = /^(?:#{1,6}\s|>\s|[-+*]\s|\d+[.)]\s)/

// Parsed text has already lost its Markdown escapes. Remember its literal
// punctuation, independently of new characters typed into the same text node.
function literalMarkers(doc: ProseMirrorNode, from = 0, to = doc.content.size): Decoration[] {
  const markers: Decoration[] = []
  doc.nodesBetween(from, to, (node, position) => {
    if (!canInterpretText(node)) return
    for (const match of (node.text ?? '').matchAll(/[\\*_~`[\]#>+.\-!()]/g)) {
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
  }).join('')
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
    if (canInterpretText(child) && /[*_~`[]/.test(child.text ?? '')) syntax = true
  })
  return syntax
}

function introducesSyntax(before: string, after: string): boolean {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1
  let end = after.length
  let oldEnd = before.length
  while (end > start && oldEnd > start && after[end - 1] === before[oldEnd - 1]) { end -= 1; oldEnd -= 1 }
  return /[*_~`[\]]/.test(after.slice(start, end)) || (blockPrefix.test(after) && !blockPrefix.test(before))
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
    } else if (canInterpretText(child) && /[*_~`[]/.test(child.text ?? '')) {
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

/** Save the typed source, not the serializer's escaped literal asterisks. */
export function editorMarkdown(editor: Editor): string {
  const pending = pendingKey.getState(editor.state)?.pending
  if (!pending?.size || !editor.markdown) return editor.getMarkdown()
  const serialize = (node: ProseMirrorNode, position: number): JSONContent => {
    if (pending.has(position)) return { type: 'rawMarkdownBlock', attrs: { raw: lineMarkdown(editor, node, position) } }
    const json = node.toJSON() as JSONContent
    if (node.childCount) {
      json.content = []
      node.forEach((child, offset) => json.content!.push(serialize(child, position + 1 + offset)))
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
    return [new Plugin<DeferredState>({
      key: pendingKey,
      state: {
        init: (_, state) => ({ pending: new Set(), literals: DecorationSet.create(state.doc, literalMarkers(state.doc)), paused: false }),
        apply(transaction, previous, oldState, nextState) {
          // Source-mode/import replacements are already parsed Markdown. Do not
          // reinterpret intentionally escaped literal markers as newly typed syntax.
          if (transaction.getMeta('preventUpdate') !== undefined) return {
            pending: new Set(), literals: DecorationSet.create(nextState.doc, literalMarkers(nextState.doc)), paused: false,
          }
          const pending = new Set<number>()
          const committed = transaction.getMeta(pendingKey) as number[] | undefined
          let literals = previous.literals.map(transaction.mapping, nextState.doc)
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
          return { pending, literals, paused: transaction.getMeta(pauseKey) ?? previous.paused }
        },
      },
      appendTransaction(transactions, _oldState, state) {
        if (composing || editor.view.composing || pendingKey.getState(state)?.paused || transactions.some((tr) => tr.getMeta(pendingKey) || isHistoryTransaction(tr))) return null
        const active = blurred ? null : textblockPosition(state)
        const pending = pendingKey.getState(state)?.pending
        if (!pending?.size || !editor.markdown) return null
        const transaction = state.tr
        const committed: number[] = []
        // Back-to-front replacements leave the remaining block positions stable.
        for (const position of [...pending].sort((a, b) => b - a)) {
          if (position === active) continue
          const node = state.doc.nodeAt(position)
          if (!node || !canDefer(node)) continue
          const parsed = editor.schema.nodeFromJSON(editor.markdown.parse(lineMarkdown(editor, node, position, pendingKey.getState(state)?.literals)))
          const $position = state.doc.resolve(position)
          if (!$position.parent.canReplace($position.index(), $position.index() + 1, parsed.content)) continue
          if (!parsed.content.eq(state.doc.content.cut(position, position + node.nodeSize))) {
            committed.push(position)
            transaction.replaceWith(position, position + node.nodeSize, parsed.content)
          }
        }
        return committed.length ? transaction.setMeta(pendingKey, committed) : null
      },
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || composing || view.composing) return false
          const state = view.state
          const { $from } = state.selection
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
          const deferred = pendingKey.getState(state)
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
          if (composing) return null
          const position = textblockPosition(state)
          if (position === null || !pendingKey.getState(state)?.pending.has(position)) return null
          const node = state.doc.nodeAt(position)
          if (!node) return null
          const decorations: Decoration[] = []
          node.forEach((child, offset) => {
            if (!canInterpretText(child)) return
            for (const match of (child.text ?? '').matchAll(/(?<!\\)(?:^#{1,6}(?=\s)|[*_~`]+|[[\]])/g)) {
              const from = position + 1 + offset + match.index
              decorations.push(Decoration.inline(from, from + match[0].length, { class: 'editor-markdown-marker' }))
            }
          })
          return DecorationSet.create(state.doc, decorations)
        },
        handleDOMEvents: {
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

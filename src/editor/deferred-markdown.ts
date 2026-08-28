import { Extension, type Editor, type JSONContent } from '@tiptap/core'
import type {} from '@tiptap/markdown'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { isHistoryTransaction } from '@tiptap/pm/history'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const pendingKey = new PluginKey<Set<number>>('deferredMarkdown')
const blockPrefix = /^(?:#{1,6}\s|>\s|[-+*]\s|\d+[.)]\s)/

function textblockPosition(state: EditorState): number | null {
  const { $from } = state.selection
  return $from.depth > 0 && $from.parent.isTextblock ? $from.before() : null
}

function canDefer(node: ProseMirrorNode | null): boolean {
  if (!node || !['paragraph', 'heading'].includes(node.type.name)) return false
  let syntax = blockPrefix.test(node.textContent)
  node.forEach((child) => {
    if (child.isText && child.marks.length === 0 && /[*_~`[]/.test(child.text ?? '')) syntax = true
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

// Only newly typed, unmarked text is interpreted as Markdown. Already formatted
// content keeps its existing marks, images and links when the line is committed.
function lineMarkdown(editor: Editor, node: ProseMirrorNode): string {
  let text = ''
  node.forEach((child) => {
    if (child.isText && child.marks.length === 0) {
      text += (child.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

export function hasPendingMarkdown(editor: Editor): boolean {
  return Boolean(pendingKey.getState(editor.state)?.size)
}

/** Save the typed source, not the serializer's escaped literal asterisks. */
export function editorMarkdown(editor: Editor): string {
  const pending = pendingKey.getState(editor.state)
  if (!pending?.size || !editor.markdown) return editor.getMarkdown()
  const serialize = (node: ProseMirrorNode, position: number): JSONContent => {
    if (pending.has(position)) return { type: 'rawMarkdownBlock', attrs: { raw: lineMarkdown(editor, node) } }
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
  addProseMirrorPlugins() {
    const editor = this.editor
    let composing = false
    return [new Plugin<Set<number>>({
      key: pendingKey,
      state: {
        init: () => new Set(),
        apply(transaction, previous, oldState, nextState) {
          // Source-mode/import replacements are already parsed Markdown. Do not
          // reinterpret intentionally escaped literal markers as newly typed syntax.
          if (transaction.getMeta('preventUpdate') !== undefined) return new Set()
          const pending = new Set<number>()
          const committed = transaction.getMeta(pendingKey) as number[] | undefined
          for (const position of previous) {
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
          return pending
        },
      },
      appendTransaction(transactions, _oldState, state) {
        if (composing || editor.view.composing || transactions.some((tr) => tr.getMeta(pendingKey) || isHistoryTransaction(tr))) return null
        const active = textblockPosition(state)
        const pending = pendingKey.getState(state)
        if (!pending?.size || !editor.markdown) return null
        const transaction = state.tr
        const committed: number[] = []
        // Back-to-front replacements leave the remaining block positions stable.
        for (const position of [...pending].sort((a, b) => b - a)) {
          if (position === active) continue
          const node = state.doc.nodeAt(position)
          if (!node || !canDefer(node)) continue
          const parsed = editor.schema.nodeFromJSON(editor.markdown.parse(lineMarkdown(editor, node)))
          const $position = state.doc.resolve(position)
          if (!$position.parent.canReplace($position.index(), $position.index() + 1, parsed.content)) continue
          committed.push(position)
          if (!parsed.content.eq(state.doc.content.cut(position, position + node.nodeSize))) {
            transaction.replaceWith(position, position + node.nodeSize, parsed.content)
          }
        }
        return committed.length ? transaction.setMeta(pendingKey, committed) : null
      },
      props: {
        decorations(state) {
          if (composing) return null
          const position = textblockPosition(state)
          if (position === null || !pendingKey.getState(state)?.has(position)) return null
          const node = state.doc.nodeAt(position)
          if (!node) return null
          const decorations: Decoration[] = []
          node.forEach((child, offset) => {
            if (!child.isText || child.marks.length) return
            for (const match of (child.text ?? '').matchAll(/(?<!\\)(?:^#{1,6}(?=\s)|[*_~`]+|[[\]])/g)) {
              const from = position + 1 + offset + match.index
              decorations.push(Decoration.inline(from, from + match[0].length, { class: 'editor-markdown-marker' }))
            }
          })
          return DecorationSet.create(state.doc, decorations)
        },
        handleDOMEvents: {
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

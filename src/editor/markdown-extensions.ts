import { Mark, Node, mergeAttributes, type JSONContent, type MarkdownParseHelpers, type MarkdownRendererHelpers, type MarkdownToken } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Table } from '@tiptap/extension-table'
import katex from 'katex'

function longestBacktickRun(value: string): number {
  return Math.max(0, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length))
}

export const SafeCodeBlock = CodeBlockLowlight.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    const content = node.content ? helpers.renderChildren(node.content) : ''
    const fence = '`'.repeat(Math.max(3, longestBacktickRun(content) + 1))
    const language = String(node.attrs?.language ?? '').trim()
    return `${fence}${language}\n${content}\n${fence}`
  },
})

function escapeTableCell(value: string): string {
  return value
    .replace(/\\?\|/g, '\\|')
    .replace(/[ \t]*\r?\n[ \t]*/g, '<br>')
    .trim()
}

function renderSafeTable(node: JSONContent, helpers: MarkdownRendererHelpers): string {
  const rows = node.content ?? []
  if (rows.length === 0) return ''
  const columnCount = Math.max(0, ...rows.map((row) => row.content?.length ?? 0))
  if (columnCount === 0) return ''

  const cells = rows.map((row) => Array.from({ length: columnCount }, (_, index) => {
    const cell = row.content?.[index]
    return {
      text: escapeTableCell(cell?.content ? helpers.renderChildren(cell.content) : ''),
      header: cell?.type === 'tableHeader',
      align: cell?.attrs?.align === 'left' || cell?.attrs?.align === 'center' || cell?.attrs?.align === 'right'
        ? cell.attrs.align as 'left' | 'center' | 'right'
        : null,
    }
  }))
  const header = cells[0]
  const hasHeader = header.some((cell) => cell.header)
  const body = hasHeader ? cells.slice(1) : cells
  const alignments = Array.from({ length: columnCount }, (_, column) =>
    cells.find((row) => row[column]?.align)?.[column]?.align ?? null)
  const renderRow = (row: typeof header) => `| ${row.map((cell) => cell.text).join(' | ')} |`
  const separators = alignments.map((align) => {
    if (align === 'left') return ':---'
    if (align === 'center') return ':---:'
    if (align === 'right') return '---:'
    return '---'
  })

  return [
    renderRow(hasHeader ? header : header.map(() => ({ text: '', header: true, align: null }))),
    `| ${separators.join(' | ')} |`,
    ...body.map(renderRow),
  ].join('\n')
}

export const SafeTable = Table.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    return renderSafeTable(node, helpers)
  },
})

function semanticMark(name: string, tag: 'mark' | 'sub' | 'sup') {
  return Mark.create({
    name,
    parseHTML() { return [{ tag }] },
    renderHTML({ HTMLAttributes }) { return [tag, mergeAttributes(HTMLAttributes), 0] },
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
      return `<${tag}>${helpers.renderChildren(node)}</${tag}>`
    },
  })
}

/** Semantic HTML is understood by Hugo Goldmark and survives source-mode edits. */
export const TextHighlight = semanticMark('textHighlight', 'mark')
export const Subscript = semanticMark('subscript', 'sub')
export const Superscript = semanticMark('superscript', 'sup')

function mathAttributes() {
  return { latex: { default: undefined, isRequired: true } }
}

function mathNodeView(displayMode: boolean) {
  return ({ node }: { node: { attrs: Record<string, unknown> } }) => {
    const dom = document.createElement(displayMode ? 'div' : 'span')
    dom.dataset.math = displayMode ? 'block' : 'inline'
    const render = (latex: string) => {
      try {
        katex.render(latex, dom, { displayMode, throwOnError: false, strict: 'warn', trust: false })
      } catch {
        dom.textContent = latex
        dom.dataset.mathError = 'true'
      }
    }
    render(String(node.attrs.latex ?? ''))
    return {
      dom,
      update(nextNode: { type: { name: string }, attrs: Record<string, unknown> }) {
        if (nextNode.type.name !== (displayMode ? 'mathBlock' : 'mathInline')) return false
        render(String(nextNode.attrs.latex ?? ''))
        return true
      },
    }
  }
}

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  priority: 1200,
  addAttributes: mathAttributes,
  parseHTML() { return [{ tag: 'div[data-math="block"]', getAttrs: (element) => ({ latex: (element as HTMLElement).dataset.latex ?? '' }) }] },
  renderHTML({ node }) { return ['div', { 'data-math': 'block', 'data-latex': String(node.attrs.latex ?? '') }] },
  addNodeView() { return mathNodeView(true) },
  markdownTokenName: 'mathBlock',
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.createNode('mathBlock', { latex: String(token.text ?? '') })
  },
  renderMarkdown(node: JSONContent) { return `$$\n${String(node.attrs?.latex ?? '')}\n$$` },
  markdownTokenizer: {
    name: 'mathBlock',
    level: 'block',
    start(src: string) { return src.search(/^ {0,3}\$\$\s*$/m) },
    tokenize(src: string) {
      const match = src.match(/^ {0,3}\$\$[ \t]*\n([\s\S]*?)\n {0,3}\$\$[ \t]*(?:\n|$)/)
      return match ? { type: 'mathBlock', raw: match[0], text: match[1] } : undefined
    },
  },
})

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  priority: 1200,
  addAttributes: mathAttributes,
  parseHTML() { return [{ tag: 'span[data-math="inline"]', getAttrs: (element) => ({ latex: (element as HTMLElement).dataset.latex ?? '' }) }] },
  renderHTML({ node }) { return ['span', { 'data-math': 'inline', 'data-latex': String(node.attrs.latex ?? '') }] },
  addNodeView() { return mathNodeView(false) },
  markdownTokenName: 'mathInline',
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.createNode('mathInline', { latex: String(token.text ?? '') })
  },
  renderMarkdown(node: JSONContent) { return `$${String(node.attrs?.latex ?? '')}$` },
  markdownTokenizer: {
    name: 'mathInline',
    level: 'inline',
    start(src: string) { return src.search(/(^|[^\\])\$(?!\$)/) },
    tokenize(src: string) {
      const match = src.match(/^\$(?!\$)(?!\s)((?:\\.|[^$\n])+?)(?<!\s)\$(?!\$)/)
      return match ? { type: 'mathInline', raw: match[0], text: match[1] } : undefined
    },
  },
})

const CALLOUT_TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const
type CalloutType = typeof CALLOUT_TYPES[number]

function calloutType(value: unknown): CalloutType {
  const normalized = String(value ?? '').toUpperCase()
  return CALLOUT_TYPES.includes(normalized as CalloutType) ? normalized as CalloutType : 'NOTE'
}

export const CalloutBlock = Node.create({
  name: 'calloutBlock',
  group: 'block',
  atom: true,
  selectable: true,
  priority: 1150,
  addAttributes() { return { kind: { default: 'NOTE' }, content: { default: undefined, isRequired: true } } },
  parseHTML() {
    return [{ tag: 'aside[data-callout]', getAttrs: (element) => ({
      kind: calloutType((element as HTMLElement).dataset.callout),
      content: (element as HTMLElement).dataset.content ?? '',
    }) }]
  },
  renderHTML({ node }) {
    return ['aside', { 'data-callout': calloutType(node.attrs.kind), 'data-content': String(node.attrs.content ?? '') },
      ['strong', {}, calloutType(node.attrs.kind)], ['p', {}, String(node.attrs.content ?? '')]]
  },
  markdownTokenName: 'calloutBlock',
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.createNode('calloutBlock', { kind: calloutType(token.kind), content: String(token.text ?? '') })
  },
  renderMarkdown(node: JSONContent) {
    const content = String(node.attrs?.content ?? '').split('\n').map((line) => `> ${line}`).join('\n')
    return `> [!${calloutType(node.attrs?.kind)}]\n${content}`
  },
  markdownTokenizer: {
    name: 'calloutBlock',
    level: 'block',
    start(src: string) { return src.search(/^ {0,3}>[ \t]*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/im) },
    tokenize(src: string) {
      const match = src.match(/^ {0,3}>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)((?: {0,3}>[^\n]*(?:\n|$))*)/i)
      if (!match) return undefined
      const content = match[2].replace(/^ {0,3}> ?/gm, '').replace(/\n$/, '')
      return { type: 'calloutBlock', raw: match[0], kind: match[1].toUpperCase(), text: content }
    },
  },
})

export const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,
  selectable: true,
  priority: 1150,
  addAttributes() { return { source: { default: undefined, isRequired: true } } },
  parseHTML() { return [{ tag: 'pre[data-mermaid-source]', getAttrs: (element) => ({ source: (element as HTMLElement).dataset.mermaidSource ?? '' }) }] },
  renderHTML({ node }) { return ['pre', { 'data-mermaid-source': String(node.attrs.source ?? ''), title: 'Mermaid 图表；请在源代码模式中编辑' }, String(node.attrs.source ?? '')] },
  markdownTokenName: 'mermaidBlock',
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.createNode('mermaidBlock', { source: String(token.text ?? '') })
  },
  renderMarkdown(node: JSONContent) { return `\`\`\`mermaid\n${String(node.attrs?.source ?? '')}\n\`\`\`` },
  markdownTokenizer: {
    name: 'mermaidBlock',
    level: 'block',
    start(src: string) { return src.search(/^ {0,3}`{3,}mermaid[ \t]*$/im) },
    tokenize(src: string) {
      const match = src.match(/^ {0,3}(`{3,})mermaid[ \t]*\n([\s\S]*?)\n {0,3}\1[ \t]*(?:\n|$)/i)
      return match ? { type: 'mermaidBlock', raw: match[0], text: match[2] } : undefined
    },
  },
})

function rawNodeAttributes() {
  return {
    raw: {
      default: '',
      parseHTML: (element: HTMLElement) => element.textContent ?? '',
    },
  }
}

function rawMarkdown(token: MarkdownToken): string {
  return String(token.raw ?? token.text ?? '')
}

export const RawMarkdownBlock = Node.create({
  name: 'rawMarkdownBlock',
  group: 'block',
  atom: true,
  selectable: true,
  priority: 1000,
  addAttributes: rawNodeAttributes,
  parseHTML() {
    return [{ tag: 'pre[data-raw-markdown="block"]' }]
  },
  renderHTML({ node }) {
    return ['pre', { 'data-raw-markdown': 'block', title: '请在源代码模式中编辑' }, String(node.attrs.raw ?? '')]
  },
  markdownTokenName: 'rawMarkdownBlock',
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.createNode('rawMarkdownBlock', { raw: rawMarkdown(token) })
  },
  renderMarkdown(node: JSONContent) {
    return String(node.attrs?.raw ?? '')
  },
  markdownTokenizer: {
    name: 'rawMarkdownBlock',
    level: 'block',
    start(src: string) {
      const match = src.match(/^(?: {0,3})(?:<!--|\[\^[^\]]+\]:|\{\{[<%]|<(?:address|article|aside|blockquote|details|dialog|div|fieldset|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|section|summary|table|ul)\b)/im)
      return match?.index ?? -1
    },
    tokenize(src: string) {
      const comment = src.match(/^ {0,3}<!--[\s\S]*?-->(?:\n|$)/)
      if (comment) return { type: 'rawMarkdownBlock', raw: comment[0] }

      const footnote = src.match(/^ {0,3}\[\^[^\]\n]+\]:[^\n]*(?:\n(?:(?: {2,}|\t)[^\n]*|\s*))*?(?=\n\S|$)/)
      if (footnote) return { type: 'rawMarkdownBlock', raw: footnote[0].replace(/\n$/, '') }

      const shortcode = src.match(/^ {0,3}\{\{[<%][^\n]*?[>%]\}\}[ \t]*(?:\n|$)/)
      if (shortcode) return { type: 'rawMarkdownBlock', raw: shortcode[0].replace(/\n$/, '') }

      const pairedHtml = src.match(/^ {0,3}<([A-Za-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>[ \t]*(?:\n|$)/i)
      if (pairedHtml) return { type: 'rawMarkdownBlock', raw: pairedHtml[0].replace(/\n$/, '') }

      const htmlLine = src.match(/^ {0,3}<(?:address|article|aside|blockquote|details|dialog|div|fieldset|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|section|summary|table|ul)\b[^>]*\/?>(?:[^\n]*)?(?:\n|$)/i)
      if (htmlLine) return { type: 'rawMarkdownBlock', raw: htmlLine[0].replace(/\n$/, '') }
      return undefined
    },
  },
})

export const RawMarkdownInline = Node.create({
  name: 'rawMarkdownInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  priority: 1000,
  addAttributes: rawNodeAttributes,
  parseHTML() {
    return [{ tag: 'code[data-raw-markdown="inline"]' }]
  },
  renderHTML({ node }) {
    return ['code', { 'data-raw-markdown': 'inline', title: '请在源代码模式中编辑' }, String(node.attrs.raw ?? '')]
  },
  markdownTokenName: 'rawMarkdownInline',
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.createNode('rawMarkdownInline', { raw: rawMarkdown(token) })
  },
  renderMarkdown(node: JSONContent) {
    return String(node.attrs?.raw ?? '')
  },
  markdownTokenizer: {
    name: 'rawMarkdownInline',
    level: 'inline',
    start(src: string) {
      const indexes = [src.search(/\{\{[<%]/), src.search(/\[\^[^\]]+\]/), src.search(/<\/?[A-Za-z][^>\n]*>/)]
        .filter((index) => index >= 0)
      return indexes.length ? Math.min(...indexes) : -1
    },
    tokenize(src: string) {
      const match = src.match(/^(?:\{\{[<%][\s\S]*?[>%]\}\}|\[\^[^\]\n]+\]|<\/?[A-Za-z][^>\n]*>)/)
      return match ? { type: 'rawMarkdownInline', raw: match[0] } : undefined
    },
  },
})

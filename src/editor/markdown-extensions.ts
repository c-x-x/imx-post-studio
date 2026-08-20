import { Node, type JSONContent, type MarkdownParseHelpers, type MarkdownRendererHelpers, type MarkdownToken } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Table } from '@tiptap/extension-table'

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

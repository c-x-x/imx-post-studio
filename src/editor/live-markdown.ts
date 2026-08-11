import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { safeMediaName } from '../media/names'
import type { EditorMode } from './editor-mode'
import { EditableTableWidget } from './live-table-widget'
import { parseMarkdownTable } from './table-model'

export interface LiveMarkdownImage {
  alt: string
  name: string
  url: string
}

export interface LiveMarkdownOptions {
  disabled: boolean
  images: ReadonlyMap<string, LiveMarkdownImage>
  mode: EditorMode
}

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolve']>

interface BlockRange {
  from: number
  to: number
}

const headingPattern = /^ATXHeading([1-6])$/
const outerBlockNames = new Set(['Blockquote', 'ListItem', 'FencedCode', 'HorizontalRule', 'Table'])
const markerNames = new Set([
  'CodeInfo',
  'CodeMark',
  'EmphasisMark',
  'HeaderMark',
  'LinkMark',
  'ListMark',
  'QuoteMark',
  'StrikethroughMark',
  'URL',
])

function logicalBlock(node: SyntaxNode | null): SyntaxNode | null {
  let paragraph: SyntaxNode | null = null
  let current = node
  while (current) {
    if (headingPattern.test(current.name) || outerBlockNames.has(current.name)) return current
    if (current.name === 'Paragraph') paragraph = current
    current = current.parent
  }
  return paragraph
}

function activeBlocks(state: EditorState): BlockRange[] {
  const tree = syntaxTree(state)
  const blocks = new Map<string, BlockRange>()
  for (const selection of state.selection.ranges) {
    for (const position of selection.empty ? [selection.from] : [selection.from, selection.to]) {
      const block = logicalBlock(tree.resolveInner(position, position === 0 ? 1 : -1))
      if (block) blocks.set(`${block.from}:${block.to}`, { from: block.from, to: block.to })
    }
  }
  return [...blocks.values()]
}

function nodeIsActive(node: SyntaxNode, blocks: BlockRange[]): boolean {
  const block = logicalBlock(node)
  return block !== null && blocks.some(({ from, to }) => from === block.from && to === block.to)
}

function hiddenMarkerRange(state: EditorState, node: SyntaxNode): BlockRange {
  if (node.name !== 'HeaderMark') return { from: node.from, to: node.to }
  const separator = state.doc.sliceString(node.to, node.to + 1)
  return { from: node.from, to: /[\t ]/.test(separator) ? node.to + 1 : node.to }
}

function addLineClasses(state: EditorState, ranges: Array<Range<Decoration>>, from: number, to: number, className: string) {
  let line = state.doc.lineAt(from)
  while (line.from <= to) {
    ranges.push(Decoration.line({ attributes: { class: className } }).range(line.from))
    if (line.to >= to || line.number >= state.doc.lines) break
    line = state.doc.line(line.number + 1)
  }
}

class LocalImageWidget extends WidgetType {
  constructor(private readonly image: LiveMarkdownImage) {
    super()
  }

  eq(other: LocalImageWidget) {
    return this.image.alt === other.image.alt
      && this.image.name === other.image.name
      && this.image.url === other.image.url
  }

  toDOM() {
    const figure = document.createElement('figure')
    figure.className = 'cm-md-image'
    const image = document.createElement('img')
    image.src = this.image.url
    image.alt = this.image.alt
    figure.append(image)
    return figure
  }

  ignoreEvent() {
    return true
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const rule = document.createElement('span')
    rule.className = 'cm-md-horizontal-rule'
    rule.setAttribute('aria-hidden', 'true')
    return rule
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly checked: boolean,
    private readonly disabled: boolean,
  ) {
    super()
  }

  eq(other: TaskCheckboxWidget) {
    return this.from === other.from
      && this.to === other.to
      && this.checked === other.checked
      && this.disabled === other.disabled
  }

  toDOM(view: EditorView) {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'cm-md-task-checkbox'
    checkbox.checked = this.checked
    checkbox.disabled = this.disabled
    checkbox.setAttribute('aria-label', '切换任务完成状态')
    checkbox.addEventListener('change', () => {
      if (this.disabled) return
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: checkbox.checked ? '[x]' : '[ ]',
        },
      })
    })
    return checkbox
  }

  ignoreEvent() {
    return true
  }
}

class CodeLanguageWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly language: string,
    private readonly disabled: boolean,
  ) {
    super()
  }

  eq(other: CodeLanguageWidget) {
    return this.from === other.from
      && this.to === other.to
      && this.language === other.language
      && this.disabled === other.disabled
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-md-code-language'
    const input = document.createElement('input')
    input.type = 'text'
    input.value = this.language
    input.size = Math.max(4, Math.min(12, this.language.length || 4))
    input.placeholder = '语言'
    input.disabled = this.disabled
    input.setAttribute('aria-label', '代码块语言')
    input.addEventListener('change', () => {
      const language = input.value.trim().toLowerCase().replace(/[^a-z0-9_+-]/g, '')
      if (language === this.language || this.disabled) return
      view.dispatch({ changes: { from: this.from, to: this.to, insert: language } })
    })
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      input.blur()
      view.focus()
    })
    wrapper.append(input)
    return wrapper
  }

  ignoreEvent() {
    return true
  }
}

function decorateFencedCode(state: EditorState, ranges: Array<Range<Decoration>>, node: SyntaxNode, disabled: boolean) {
  const opening = state.doc.lineAt(node.from)
  const closing = state.doc.lineAt(Math.max(node.from, node.to - 1))
  const match = /^(?:`{3,}|~{3,})([^\s`]*)/.exec(opening.text)
  const language = match?.[1] ?? ''
  const languageFrom = opening.from + (match?.[0].length ?? opening.length) - language.length

  ranges.push(Decoration.line({ attributes: { class: 'cm-md-code-fence cm-md-code-fence-opening' } }).range(opening.from))
  if (opening.length > 0) ranges.push(Decoration.mark({ class: 'cm-md-hidden' }).range(opening.from, opening.to))

  let codeLine = 1
  for (let lineNumber = opening.number + 1; lineNumber < closing.number; lineNumber += 1) {
    const line = state.doc.line(lineNumber)
    const edge = lineNumber === opening.number + 1 ? ' cm-md-code-line-first' : ''
    ranges.push(Decoration.line({
      attributes: { class: `cm-md-fenced-code cm-md-code-line${edge}`, 'data-code-line': String(codeLine) },
    }).range(line.from))
    codeLine += 1
  }

  ranges.push(Decoration.line({ attributes: { class: 'cm-md-code-fence cm-md-code-fence-closing' } }).range(closing.from))
  if (closing.length > 0) {
    ranges.push(Decoration.replace({
      widget: new CodeLanguageWidget(languageFrom, opening.to, language, disabled),
    }).range(closing.from, closing.to))
  }
}

function localImage(state: EditorState, node: SyntaxNode, options: LiveMarkdownOptions): LiveMarkdownImage | undefined {
  const urlNode = node.getChild('URL')
  if (!urlNode) return undefined
  const path = state.doc.sliceString(urlNode.from, urlNode.to)
  if (!path.startsWith('images/')) return undefined
  const name = path.slice('images/'.length)
  if (!name || path !== `images/${name}` || safeMediaName(name) !== name) return undefined
  return options.images.get(name)
}

function buildDecorations(state: EditorState, options: LiveMarkdownOptions): DecorationSet {
  if (options.mode === 'source') return Decoration.none

  const blocks = activeBlocks(state)
  const ranges: Array<Range<Decoration>> = []
  const tree = syntaxTree(state)

  tree.iterate({
    enter(reference) {
      const node = reference.node
      const heading = headingPattern.exec(node.name)
      if (heading) addLineClasses(state, ranges, node.from, node.to, `cm-md-heading cm-md-heading-${heading[1]}`)

      switch (node.name) {
        case 'Table': {
          const table = parseMarkdownTable(state.doc.sliceString(node.from, node.to))
          if (table) {
            const tableLine = state.doc.lineAt(node.from)
            if (tableLine.number > 1) {
              const separator = state.doc.line(tableLine.number - 1)
              if (separator.length === 0) {
                ranges.push(Decoration.line({ attributes: { class: 'cm-md-table-separator' } }).range(separator.from))
              }
            }
            ranges.push(Decoration.replace({
              block: true,
              widget: new EditableTableWidget(node.from, node.to, table, options.disabled),
            }).range(node.from, node.to))
            return false
          }
          break
        }
        case 'TaskMarker': {
          const marker = state.doc.sliceString(node.from, node.to)
          ranges.push(Decoration.replace({
            widget: new TaskCheckboxWidget(node.from, node.to, /^\[[xX]\]$/.test(marker), options.disabled),
          }).range(node.from, node.to))
          break
        }
        case 'StrongEmphasis':
          ranges.push(Decoration.mark({ class: 'cm-md-strong' }).range(node.from, node.to))
          break
        case 'Emphasis':
          ranges.push(Decoration.mark({ class: 'cm-md-emphasis' }).range(node.from, node.to))
          break
        case 'Strikethrough':
          ranges.push(Decoration.mark({ class: 'cm-md-strikethrough' }).range(node.from, node.to))
          break
        case 'InlineCode':
          ranges.push(Decoration.mark({ class: 'cm-md-inline-code' }).range(node.from, node.to))
          break
        case 'FencedCode':
          decorateFencedCode(state, ranges, node, options.disabled)
          break
        case 'Blockquote':
          addLineClasses(state, ranges, node.from, node.to, 'cm-md-quote')
          break
        case 'BulletList':
        case 'OrderedList':
          addLineClasses(state, ranges, node.from, node.to, 'cm-md-list')
          break
        case 'Link':
          ranges.push(Decoration.mark({ class: 'cm-md-link' }).range(node.from, node.to))
          break
        case 'Image': {
          if (nodeIsActive(node, blocks)) break
          const image = localImage(state, node, options)
          if (image) {
            ranges.push(Decoration.replace({ widget: new LocalImageWidget(image) }).range(node.from, node.to))
            return false
          }
          break
        }
        case 'HorizontalRule':
          if (!nodeIsActive(node, blocks)) {
            ranges.push(Decoration.replace({ widget: new HorizontalRuleWidget() }).range(node.from, node.to))
          }
          break
        default:
          break
      }

      if (markerNames.has(node.name) && !nodeIsActive(node, blocks)) {
        const marker = hiddenMarkerRange(state, node)
        ranges.push(Decoration.mark({ class: 'cm-md-hidden' }).range(marker.from, marker.to))
      }
      return undefined
    },
  })

  return Decoration.set(ranges, true)
}

export function liveMarkdown(options: LiveMarkdownOptions): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, options)
    },
    update(decorations, transaction) {
      return transaction.docChanged || transaction.selection
        ? buildDecorations(transaction.state, options)
        : decorations
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}

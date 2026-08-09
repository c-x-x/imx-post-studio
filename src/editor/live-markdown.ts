import type { Extension, Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { safeMediaName } from '../media/names'
import type { EditorMode } from './editor-mode'

export interface LiveMarkdownImage {
  alt: string
  name: string
  url: string
}

export interface LiveMarkdownOptions {
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

function activeBlocks(view: EditorView): BlockRange[] {
  const tree = syntaxTree(view.state)
  const blocks = new Map<string, BlockRange>()
  for (const selection of view.state.selection.ranges) {
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

function addLineClasses(view: EditorView, ranges: Array<Range<Decoration>>, from: number, to: number, className: string) {
  let line = view.state.doc.lineAt(from)
  while (line.from <= to) {
    ranges.push(Decoration.line({ attributes: { class: className } }).range(line.from))
    if (line.to >= to || line.number >= view.state.doc.lines) break
    line = view.state.doc.line(line.number + 1)
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

function localImage(view: EditorView, node: SyntaxNode, options: LiveMarkdownOptions): LiveMarkdownImage | undefined {
  const urlNode = node.getChild('URL')
  if (!urlNode) return undefined
  const path = view.state.doc.sliceString(urlNode.from, urlNode.to)
  if (!path.startsWith('images/')) return undefined
  const name = path.slice('images/'.length)
  if (!name || path !== `images/${name}` || safeMediaName(name) !== name) return undefined
  return options.images.get(name)
}

function buildDecorations(view: EditorView, options: LiveMarkdownOptions): DecorationSet {
  if (options.mode === 'source') return Decoration.none

  const blocks = activeBlocks(view)
  const ranges: Array<Range<Decoration>> = []
  const tree = syntaxTree(view.state)

  tree.iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter(reference) {
      const node = reference.node
      const heading = headingPattern.exec(node.name)
      if (heading) addLineClasses(view, ranges, node.from, node.to, `cm-md-heading cm-md-heading-${heading[1]}`)

      switch (node.name) {
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
          addLineClasses(view, ranges, node.from, node.to, 'cm-md-fenced-code')
          break
        case 'Blockquote':
          addLineClasses(view, ranges, node.from, node.to, 'cm-md-quote')
          break
        case 'BulletList':
        case 'OrderedList':
          addLineClasses(view, ranges, node.from, node.to, 'cm-md-list')
          break
        case 'Link':
          ranges.push(Decoration.mark({ class: 'cm-md-link' }).range(node.from, node.to))
          break
        case 'Image': {
          if (nodeIsActive(node, blocks)) break
          const image = localImage(view, node, options)
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
        ranges.push(Decoration.mark({ class: 'cm-md-hidden' }).range(node.from, node.to))
      }
      return undefined
    },
  })

  return Decoration.set(ranges, true)
}

export function liveMarkdown(options: LiveMarkdownOptions): Extension {
  class LiveMarkdownPlugin {
    decorations: DecorationSet
    refreshAfterComposition = false

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view, options)
    }

    update(update: ViewUpdate) {
      if (update.view.compositionStarted) return
      if (this.refreshAfterComposition || update.docChanged || update.selectionSet || update.viewportChanged) {
        this.refreshAfterComposition = false
        this.decorations = buildDecorations(update.view, options)
      }
    }
  }

  return ViewPlugin.fromClass(LiveMarkdownPlugin, {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      compositionend(_event, view) {
        this.refreshAfterComposition = true
        view.dispatch({})
      },
    },
  })
}

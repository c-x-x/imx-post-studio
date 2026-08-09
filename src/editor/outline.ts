import type { Heading, Root } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

export interface EditorOutlineItem {
  depth: number
  text: string
  from: number
}

const outlineParser = unified().use(remarkParse).use(remarkGfm)

export function extractEditorOutline(markdown: string): EditorOutlineItem[] {
  const tree = outlineParser.parse(markdown) as Root
  const items: EditorOutlineItem[] = []

  visit(tree, 'heading', (node: Heading) => {
    const from = node.position?.start.offset
    const text = toString(node).trim()
    if (typeof from === 'number' && text) items.push({ depth: node.depth, text, from })
  })

  return items
}

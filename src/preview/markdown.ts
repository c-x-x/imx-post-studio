import GithubSlugger from 'github-slugger'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type { Element, Root } from 'hast'
import { safeMediaName } from '../media/names'
import { nestToc, type TocHeading, type TocItem } from './toc'

export interface RenderedMarkdown {
  html: string
  toc: TocItem[]
  wordCount: number
  readingMinutes: number
}

function elementText(node: Element): string {
  return node.children.map((child) => {
    if (child.type === 'text') return child.value
    if (child.type === 'element') return elementText(child)
    return ''
  }).join('')
}

function isNormalizedLocalImage(path: string): boolean {
  if (!path.startsWith('images/') || path.includes('?') || path.includes('#')) return false
  const segments = path.split('/')
  return segments.length === 2 && safeMediaName(segments[1]) === segments[1]
}

function estimateWords(markdown: string): number {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/<[^>]*>/g, ' ')
  const han = plain.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const words = plain.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  return han + words
}

function collectHeadingsAndRewriteImages(resolveLocalImage: (path: string) => string | undefined, headings: TocHeading[]) {
  return (tree: Root) => {
    const slugger = new GithubSlugger()
    visit(tree, 'element', (node: Element) => {
      if (/^h[1-6]$/.test(node.tagName)) {
        const text = elementText(node).trim()
        const id = slugger.slug(text)
        node.properties.id = id
        headings.push({ id, depth: Number(node.tagName[1]), text })
      }
      if (node.tagName === 'img') {
        const source = typeof node.properties.src === 'string' ? node.properties.src : ''
        const resolved = isNormalizedLocalImage(source) ? resolveLocalImage(source) : undefined
        if (resolved) node.properties.src = resolved
        else delete node.properties.src
      }
      if (node.tagName === 'a' && typeof node.properties.href === 'string' && !/^(https?:|mailto:|#)/i.test(node.properties.href)) {
        delete node.properties.href
      }
    })
  }
}

export async function renderMarkdown(
  markdown: string,
  resolveLocalImage: (path: string) => string | undefined,
): Promise<RenderedMarkdown> {
  const headings: TocHeading[] = []
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize)
    .use(rehypeHighlight, { detect: false })
    .use(() => collectHeadingsAndRewriteImages(resolveLocalImage, headings))
    .use(rehypeStringify)

  const output = await processor.process(markdown)
  return {
    html: String(output),
    toc: nestToc(headings),
    wordCount: estimateWords(markdown),
    readingMinutes: Math.ceil(estimateWords(markdown) / 300),
  }
}

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

function estimateWords(text: string): number {
  const han = text.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const words = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  return han + words
}

function isSafeBlobUrl(url: string | undefined): url is string {
  return typeof url === 'string' && /^blob:[^\s]+$/i.test(url)
}

function renderedText(node: Root | Root['children'][number], skip = false): string {
  if (node.type === 'text') return skip ? '' : node.value
  if (!('children' in node)) return ''
  const omit = skip || (node.type === 'element' && (node.tagName === 'code' || node.tagName === 'style'))
  return node.children.map((child) => renderedText(child, omit)).join('')
}

function collectHeadingsRewriteImagesAndMeasure(resolveLocalImage: (path: string) => string | undefined, headings: TocHeading[], metrics: { wordCount: number }) {
  return (tree: Root) => {
    const slugger = new GithubSlugger()
    visit(tree, 'element', (node: Element) => {
      if (/^h[2-5]$/.test(node.tagName)) {
        const text = elementText(node).trim()
        const id = `imx-heading-${slugger.slug(text)}`
        node.properties.id = id
        headings.push({ id, depth: Number(node.tagName[1]), text })
      }
      if (node.tagName === 'img') {
        const source = typeof node.properties.src === 'string' ? node.properties.src : ''
        if (isNormalizedLocalImage(source)) {
          const resolved = resolveLocalImage(source)
          if (isSafeBlobUrl(resolved)) node.properties.src = resolved
          else delete node.properties.src
        }
      }
      if (node.tagName === 'a' && typeof node.properties.href === 'string' && !/^(https?:|mailto:|#)/i.test(node.properties.href)) {
        delete node.properties.href
      }
    })
    metrics.wordCount = estimateWords(renderedText(tree))
  }
}

export async function renderMarkdown(
  markdown: string,
  resolveLocalImage: (path: string) => string | undefined,
): Promise<RenderedMarkdown> {
  const headings: TocHeading[] = []
  const metrics = { wordCount: 0 }
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize)
    .use(rehypeHighlight, { detect: false })
    .use(() => collectHeadingsRewriteImagesAndMeasure(resolveLocalImage, headings, metrics))
    .use(rehypeStringify)

  const output = await processor.process(markdown)
  return {
    html: String(output),
    toc: nestToc(headings),
    wordCount: metrics.wordCount,
    readingMinutes: metrics.wordCount === 0 ? 0 : Math.ceil(metrics.wordCount / 300),
  }
}

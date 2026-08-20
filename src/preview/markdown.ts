import GithubSlugger from 'github-slugger'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
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

function isLocalLookingImage(path: string): boolean {
  return /^images(?:[/%\\]|$)/i.test(path)
}

function estimateWords(text: string): number {
  const han = text.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const words = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  return han + words
}

function isSafeBlobUrl(url: string | undefined): url is string {
  return typeof url === 'string' && /^blob:[^\s]+$/i.test(url)
}

const codeLanguages: Record<string, { key: string; label: string }> = {
  bash: { key: 'bash', label: 'Bash' },
  sh: { key: 'shell', label: 'Shell' },
  shell: { key: 'shell', label: 'Shell' },
  zsh: { key: 'zsh', label: 'Zsh' },
  js: { key: 'javascript', label: 'JavaScript' },
  javascript: { key: 'javascript', label: 'JavaScript' },
  ts: { key: 'typescript', label: 'TypeScript' },
  typescript: { key: 'typescript', label: 'TypeScript' },
  py: { key: 'python', label: 'Python' },
  python: { key: 'python', label: 'Python' },
  html: { key: 'html', label: 'HTML' },
  css: { key: 'css', label: 'CSS' },
  json: { key: 'json', label: 'JSON' },
  yaml: { key: 'yaml', label: 'YAML' },
  yml: { key: 'yaml', label: 'YAML' },
  md: { key: 'markdown', label: 'Markdown' },
  markdown: { key: 'markdown', label: 'Markdown' },
  go: { key: 'go', label: 'Go' },
  rust: { key: 'rust', label: 'Rust' },
  java: { key: 'java', label: 'Java' },
  c: { key: 'c', label: 'C' },
  cpp: { key: 'cpp', label: 'C++' },
}

const previewSanitizeSchema = { ...defaultSchema, clobberPrefix: '' }

function codeLanguage(code: Element): { key: string; label: string } {
  const classes = Array.isArray(code.properties.className) ? code.properties.className : []
  const source = classes
    .map(String)
    .find((className) => className.startsWith('language-'))
    ?.slice('language-'.length)
    .toLowerCase()
  if (!source) return { key: 'code', label: 'Code' }
  return codeLanguages[source] ?? {
    key: /^[a-z0-9-]+$/.test(source) ? source : 'code',
    label: source.replace(/(^|-)([a-z])/g, (_, separator: string, letter: string) => `${separator ? ' ' : ''}${letter.toUpperCase()}`),
  }
}

function codeBlockHeader(label: string): Element {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['code-block-header'] },
    children: [
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['code-window-controls'], ariaHidden: 'true' },
        children: [1, 2, 3].map(() => ({ type: 'element', tagName: 'span', properties: {}, children: [] })),
      },
      { type: 'element', tagName: 'span', properties: { className: ['code-language'] }, children: [{ type: 'text', value: label }] },
      {
        type: 'element',
        tagName: 'button',
        properties: { type: 'button', className: ['copy-code-button'], dataCopyCode: '', ariaLabel: '复制代码', ariaLive: 'polite' },
        children: [{ type: 'text', value: '复制' }],
      },
    ],
  }
}

function decorateCodeBlocks() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre' || typeof index !== 'number' || !parent) return
      const code = node.children.find((child): child is Element => child.type === 'element' && child.tagName === 'code')
      if (!code) return
      const language = codeLanguage(code)
      const wrapper: Element = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['highlight'], dataCodeLang: language.key },
        children: [codeBlockHeader(language.label), node],
      }
      parent.children[index] = wrapper
      return index + 1
    })
  }
}

function renderedText(node: Root | Root['children'][number], skip = false): string {
  if (node.type === 'text') return skip ? '' : node.value
  if (!('children' in node)) return ''
  const classes = node.type === 'element' && Array.isArray(node.properties.className)
    ? node.properties.className.map(String)
    : []
  const omit = skip || (node.type === 'element' && (node.tagName === 'code' || node.tagName === 'style' || classes.includes('highlight')))
  return node.children.map((child) => renderedText(child, omit)).join('')
}

function collectHeadingsRewriteImagesAndMeasure(resolveLocalImage: (path: string) => string | undefined, headings: TocHeading[], metrics: { wordCount: number }) {
  return (tree: Root) => {
    const slugger = new GithubSlugger()
    visit(tree, 'element', (node: Element) => {
      if (/^h[2-5]$/.test(node.tagName)) {
        const existingId = typeof node.properties.id === 'string' ? node.properties.id : ''
        if (existingId === 'footnote-label' || existingId.endsWith('footnote-label')) return
        const text = elementText(node).trim()
        const id = `imx-heading-${slugger.slug(text)}`
        node.properties.id = id
        headings.push({ id, depth: Number(node.tagName[1]), text })
      }
      if (node.tagName === 'img') {
        const source = typeof node.properties.src === 'string' ? node.properties.src : ''
        if (isLocalLookingImage(source)) {
          if (isNormalizedLocalImage(source)) {
            const resolved = resolveLocalImage(source)
            if (isSafeBlobUrl(resolved)) node.properties.src = resolved
            else delete node.properties.src
          } else delete node.properties.src
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
    .use(rehypeSanitize, previewSanitizeSchema)
    .use(rehypeHighlight, { detect: false })
    .use(decorateCodeBlocks)
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

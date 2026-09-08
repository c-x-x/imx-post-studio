import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import { visit } from 'unist-util-visit'
import type { Element } from 'hast'
import type { Definition } from 'mdast'
import type { MediaAsset } from '../metadata/article.js'
import { safeMediaName } from './names.js'

interface LocalReference {
  canonical?: string
  invalid?: string
}

export function canonicalLocalImageReference(url: string): LocalReference | undefined {
  const lowerUrl = url.toLowerCase()
  if (
    lowerUrl.startsWith('http:')
    || lowerUrl.startsWith('https:')
    || lowerUrl.startsWith('data:')
    || url.startsWith('/')
    || !url.startsWith('images/')
  ) {
    return undefined
  }

  const queryIndex = url.indexOf('?')
  const fragmentIndex = url.indexOf('#')
  const pathEnd = [queryIndex, fragmentIndex]
    .filter((index) => index >= 0)
    .reduce((end, index) => Math.min(end, index), url.length)
  const encodedPath = url.slice(0, pathEnd)

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(encodedPath)
  } catch {
    return { invalid: encodedPath }
  }

  if (decodedPath.includes('\\') || decodedPath.includes('\0')) {
    return { invalid: encodedPath }
  }

  const segments = decodedPath.split('/')
  if (segments.length !== 2 || segments[0] !== 'images' || !segments[1]) {
    return { invalid: encodedPath }
  }

  const name = segments[1]
  return safeMediaName(name) === name
    ? { canonical: `images/${name}` }
    : { invalid: encodedPath }
}

const imageProcessor = unified().use(remarkParse).use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw)

function analyzeImageReferences(markdown: string): { references: string[]; invalid: string[] } {
  // Use the rendered tree so HTML, entities and reference-style images agree
  // with preview, while code examples and HTML comments remain inert.
  const parsed = imageProcessor.parse(markdown)
  const definitions = new Map<string, string>()
  visit(parsed, 'definition', (node: Definition) => {
    const key = node.identifier.toUpperCase()
    if (!definitions.has(key)) definitions.set(key, node.url)
  })
  visit(parsed, (node) => {
    const source = node.type === 'image' ? node.url
      : node.type === 'imageReference' ? definitions.get(node.identifier.toUpperCase()) : undefined
    if (source !== undefined) {
      // Keep malformed URL diagnostics faithful to the user's source rather
      // than reporting the percent escaping added by the HTML serializer.
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, src: source } }
    }
  })
  const tree = imageProcessor.runSync(parsed)
  const references: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  const addReference = (url: string) => {
    const localReference = canonicalLocalImageReference(url)
    if (localReference?.canonical && !seen.has(localReference.canonical)) {
      seen.add(localReference.canonical)
      references.push(localReference.canonical)
    }
    if (localReference?.invalid && !seen.has(localReference.invalid)) {
      seen.add(localReference.invalid)
      invalid.push(localReference.invalid)
    }
  }

  visit(tree, 'element', (node: Element) => {
    if (node.tagName === 'img' && typeof node.properties.src === 'string') addReference(node.properties.src)
  })

  return { references, invalid }
}

export function findImageReferences(markdown: string): string[] {
  return analyzeImageReferences(markdown).references
}

export function validateMediaReferences(
  markdown: string,
  media: Pick<MediaAsset, 'name' | 'kind'>[],
): { missing: string[]; unused: string[] } {
  const { references, invalid } = analyzeImageReferences(markdown)
  const available = new Set(media.map((asset) => `images/${asset.name}`))

  return {
    missing: [...references.filter((reference) => !available.has(reference)), ...invalid],
    unused: media
      .filter((asset) => asset.kind === 'body' && !references.includes(`images/${asset.name}`))
      .map((asset) => `images/${asset.name}`),
  }
}

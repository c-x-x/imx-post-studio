import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Definition, Image, ImageReference, Root } from 'mdast'
import type { MediaAsset } from '../metadata/article'
import { safeMediaName } from './names'

function normalizedIdentifier(identifier: string): string {
  return identifier.trim().replace(/\s+/g, ' ').toLowerCase()
}

interface LocalReference {
  canonical?: string
  invalid?: string
}

function canonicalLocalImageReference(url: string): LocalReference | undefined {
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

function analyzeImageReferences(markdown: string): { references: string[]; invalid: string[] } {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  const definitions = new Map<string, string>()
  const references: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  visit(tree, 'definition', (node: Definition) => {
    const identifier = normalizedIdentifier(node.identifier)
    if (!definitions.has(identifier)) {
      definitions.set(identifier, node.url)
    }
  })

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

  visit(tree, 'image', (node: Image) => {
    addReference(node.url)
  })

  visit(tree, 'imageReference', (node: ImageReference) => {
    const destination = definitions.get(normalizedIdentifier(node.identifier))
    if (destination) {
      addReference(destination)
    }
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

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Definition, Image, ImageReference, Root } from 'mdast'
import type { MediaAsset } from '../metadata/article'
import { safeMediaName } from './names'

function normalizedIdentifier(identifier: string): string {
  return identifier.trim().replace(/\s+/g, ' ').toLowerCase()
}

function canonicalLocalImageReference(url: string): string | undefined {
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
    return undefined
  }

  if (decodedPath.includes('\\') || decodedPath.includes('\0')) {
    return undefined
  }

  const segments = decodedPath.split('/')
  if (segments.length !== 2 || segments[0] !== 'images' || !segments[1]) {
    return undefined
  }

  const name = segments[1]
  return safeMediaName(name) === name ? `images/${name}` : undefined
}

export function findImageReferences(markdown: string): string[] {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  const definitions = new Map<string, string>()
  const references: string[] = []
  const seen = new Set<string>()

  visit(tree, 'definition', (node: Definition) => {
    const identifier = normalizedIdentifier(node.identifier)
    if (!definitions.has(identifier)) {
      definitions.set(identifier, node.url)
    }
  })

  const addReference = (url: string) => {
    const reference = canonicalLocalImageReference(url)
    if (reference && !seen.has(reference)) {
      seen.add(reference)
      references.push(reference)
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

  return references
}

export function validateMediaReferences(
  markdown: string,
  media: MediaAsset[],
): { missing: string[]; unused: string[] } {
  const references = findImageReferences(markdown)
  const available = new Set(media.map((asset) => `images/${asset.name}`))

  return {
    missing: references.filter((reference) => !available.has(reference)),
    unused: media
      .filter((asset) => asset.kind === 'body' && !references.includes(`images/${asset.name}`))
      .map((asset) => `images/${asset.name}`),
  }
}

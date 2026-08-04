import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Image, Root } from 'mdast'
import type { MediaAsset } from '../metadata/article'

function localImageReference(url: string): string | undefined {
  if (
    /^(?:https?:|data:|\/)/i.test(url)
    || !url.startsWith('images/')
  ) {
    return undefined
  }

  return url
}

export function findImageReferences(markdown: string): string[] {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  const references: string[] = []

  visit(tree, 'image', (node: Image) => {
    const reference = localImageReference(node.url)
    if (reference && !references.includes(reference)) {
      references.push(reference)
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

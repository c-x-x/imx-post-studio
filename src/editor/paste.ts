import type { MediaAsset } from '../metadata/article'
import { mediaAlt } from '../media/names'

interface MarkdownSelection {
  from: number
  to: number
}

export interface PastedImageRequest {
  files: File[]
  selection: MarkdownSelection
  value: string
}

export function containsPastedMarkdown(value: string): boolean {
  if (!value) return false
  const blockSyntax = /(?:^|\n)[ \t]{0,3}(?:#{1,6}[ \t]+|(?:`{3,}|~{3,})[^\n]*$|>[ \t]+|(?:[-+*]|\d+[.)])[ \t]+|\[[^\]\n]+\]:[ \t]*\S|(?:-{3,}|\*{3,}|_{3,})[ \t]*$)/m
  const tableSyntax = /(?:^|\n)[ \t]*\|?.+\|.+\n[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*(?:\n|$)/
  const completeInlineSyntax = /(?:\*\*(?=\S)[^\n]*?\S\*\*|__(?=\S)[^\n]*?\S__|~~(?=\S)[^\n]*?\S~~|`[^`\n]+`|!\[[^\]\n]*\]\([^\n)]+\)|\[[^\]\n]+\]\([^\n)]+\)|<(mark|sub|sup)>[^\n]+<\/\1>)/
  const italicSyntax = /(?:^|[\s([{])([*_])(?=\S)[^*_\n]*?\S\1(?=$|[\s)\]},.!?:;])/m
  const specialSyntax = /```mermaid\b|^\s*\$\$\s*$|\$(?!\$)(?!\s)[^\n$]+(?<!\s)\$|\[\^[^\]\n]+\]|>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/im
  return blockSyntax.test(value)
    || tableSyntax.test(value)
    || completeInlineSyntax.test(value)
    || italicSyntax.test(value)
    || specialSyntax.test(value)
}

export function clipboardImages(data: DataTransfer | null): File[] {
  if (!data) return []
  const itemFiles = Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  return itemFiles.length > 0
    ? itemFiles
    : Array.from(data.files ?? []).filter((file) => file.type.startsWith('image/'))
}

export function pastedImageMarkdown(assets: MediaAsset[]): string {
  return assets.map((asset) => `![${mediaAlt(asset.name)}](images/${asset.name})`).join('\n\n')
}

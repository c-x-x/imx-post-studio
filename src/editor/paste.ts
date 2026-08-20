import type { MediaAsset } from '../metadata/article'
import { mediaAlt } from '../media/names'
import type { MarkdownSelection } from './markdown-commands'

export interface PastedImageRequest {
  files: File[]
  selection: MarkdownSelection
  value: string
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

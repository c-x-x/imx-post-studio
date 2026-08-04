import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import type { ArticleDraft, MediaAsset } from '../metadata/article'
import { parseArticle, serializeArticle } from '../metadata/frontmatter'
import { validateSlug } from '../metadata/slug'
import { safeMediaName } from '../media/names'
import { validateMediaReferences } from '../media/references'
import { MAX_SOURCE_BYTES } from '../shared/limits'

export interface ExportOptions {
  production: boolean
  publish: boolean
}

function exportError(message: string): Error {
  return new Error(`无法导出文章：${message}`)
}

function extensionFor(mime: MediaAsset['mime']): string {
  return ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  })[mime]
}

function validateMedia(media: MediaAsset[]): void {
  const names = new Set<string>()
  let covers = 0
  for (const asset of media) {
    if (asset.blob.size > MAX_SOURCE_BYTES) {
      throw exportError(`图片 ${asset.name} 超过 25 MiB 限制`)
    }
    if (safeMediaName(asset.name) !== asset.name || !asset.name.endsWith(`.${extensionFor(asset.mime)}`)) {
      throw exportError(`图片名称或格式无效：${asset.name}`)
    }
    if (names.has(asset.name)) {
      throw exportError(`图片名称重复：${asset.name}`)
    }
    names.add(asset.name)
    if (asset.kind === 'cover') {
      covers += 1
      if (asset.name !== 'cover.webp' || asset.mime !== 'image/webp') {
        throw exportError('封面必须是 images/cover.webp 的 WebP 图片')
      }
    }
  }
  if (covers > 1) throw exportError('只能有一张封面图片')
}

function serializedForExport(draft: ArticleDraft, options: ExportOptions): string {
  if (!draft.meta.title.trim()) throw exportError('标题不能为空')
  if (!validateSlug(draft.meta.slug).ok) throw exportError('Slug 无效')
  validateMedia(draft.media)
  const references = validateMediaReferences(draft.body, draft.media)
  if (references.missing.length > 0) {
    throw exportError(`缺少正文图片：${references.missing.join('、')}`)
  }

  const draftOverride = options.production
    ? (options.publish ? false : undefined)
    : true
  const serialized = serializeArticle(draft, draftOverride)
  // The parser is the canonical front matter validator and runs before a writer
  // exists, so a malformed date or cover contract cannot create a partial ZIP.
  parseArticle(serialized)
  return serialized
}

export async function exportArticleBundle(
  draft: ArticleDraft,
  options: ExportOptions,
): Promise<Blob> {
  const article = serializedForExport(draft, options)
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  let closed = false

  try {
    await writer.add(`${draft.meta.slug}/index.md`, new TextReader(article))
    const media = [...draft.media].sort((left, right) => left.name.localeCompare(right.name))
    for (const asset of media) {
      await writer.add(`${draft.meta.slug}/images/${asset.name}`, new BlobReader(asset.blob))
    }
    const result = await writer.close()
    closed = true
    return result
  } finally {
    if (!closed) await writer.close().catch(() => undefined)
  }
}

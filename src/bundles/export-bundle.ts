import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { assertCompleteArticleMeta, type ArticleDraft, type MediaAsset } from '../metadata/article'
import { parseArticle, serializeArticle } from '../metadata/frontmatter'
import { validateMediaReferences } from '../media/references'
import { assertExportableMedia } from './media-validation'

export interface ExportOptions {
  production: boolean
  publish: boolean
}

function exportError(message: string): Error {
  return new Error(`无法导出文章：${message}`)
}

async function validateMedia(media: MediaAsset[]): Promise<void> {
  const names = new Set<string>()
  for (const asset of media) {
    if (names.has(asset.name)) {
      throw exportError(`图片名称重复：${asset.name}`)
    }
    names.add(asset.name)
    if ((asset.name === 'cover.webp') !== (asset.kind === 'cover')) {
      throw exportError('cover.webp 必须且只能作为封面图片')
    }
    if (asset.kind === 'cover' && (asset.name !== 'cover.webp' || asset.mime !== 'image/webp')) {
      throw exportError('封面必须是 images/cover.webp 的 WebP 图片')
    }
    try {
      await assertExportableMedia(asset)
    } catch (error) {
      throw exportError(error instanceof Error ? error.message : `图片校验失败：${asset.name}`)
    }
  }
}

async function serializedForExport(draft: ArticleDraft, options: ExportOptions): Promise<string> {
  try {
    assertCompleteArticleMeta(draft.meta)
  } catch (error) {
    throw exportError(error instanceof Error ? error.message : '文章元数据无效')
  }
  await validateMedia(draft.media)
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
  const article = await serializedForExport(draft, options)
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

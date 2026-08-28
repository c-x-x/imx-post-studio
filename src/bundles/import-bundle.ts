import { BlobReader, BlobWriter, TextWriter, ZipReader, type Entry, type FileEntry } from '@zip.js/zip.js'
import type { ArticleDraft, MediaAsset } from '../metadata/article'
import { assertCompleteArticleMeta, createArticleDraft } from '../metadata/article'
import { parseArticle, type ParsedArticle } from '../metadata/frontmatter'
import { validateSlug } from '../metadata/slug'
import { validateMediaReferences } from '../media/references'
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_FILE_BYTES,
  MAX_ARCHIVE_TOTAL_BYTES,
  MAX_SOURCE_BYTES,
} from '../shared/limits'
import { validateArchiveEntries, validateArchivePath } from './archive-path'
import { assertSafeImageName } from './media-validation'
import { validateBrowserImage } from '../media/validate-image'

function importError(message: string): Error {
  return new Error(`无法导入文章：${message}`)
}

function parseImportedArticle(source: string): ParsedArticle {
  try {
    return parseArticle(source)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'Front Matter 格式无效'
    throw importError(`Front Matter 解析失败：${detail}`)
  }
}

function validateImageName(name: string): void {
  try { assertSafeImageName(name) } catch { throw importError(`图片名称或格式不受支持：${name}`) }
}

function assertSupportedEntry(entry: Entry): void {
  if (entry.encrypted || entry.zipCrypto) throw importError(`不支持加密 ZIP 条目：${entry.filename}`)
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw importError(`不支持的 ZIP 压缩方法：${entry.filename}`)
  }
  if (entry.unixMode !== undefined) {
    const fileType = entry.unixMode & 0o170000
    if (fileType === 0o120000) throw importError(`不支持符号链接条目：${entry.filename}`)
    if (fileType !== 0 && fileType !== 0o100000) {
      throw importError(`不支持的 Unix 非常规文件：${entry.filename}`)
    }
  }
}

function isMacOsMetadataPath(filename: string): boolean {
  const segments = filename.split('/')
  const basename = segments.at(-1) ?? ''
  return segments[0] === '__MACOSX' || basename === '.DS_Store' || basename.startsWith('._')
}

async function createMedia(name: string, bytes: Uint8Array): Promise<MediaAsset> {
  validateImageName(name)
  let mime
  try { mime = await validateBrowserImage(name, bytes) } catch (cause) { throw importError(cause instanceof Error ? cause.message : `图片无效：${name}`) }
  if (name === 'cover.webp' && mime !== 'image/webp') {
    throw importError('封面必须为 WebP 图片')
  }
  return {
    id: crypto.randomUUID(),
    name,
    kind: name === 'cover.webp' ? 'cover' : 'body',
    mime,
    blob: new Blob([new Uint8Array(bytes).buffer], { type: mime }),
  }
}

function draftFromParsed(parsed: ParsedArticle, slug: string, media: MediaAsset[]): ArticleDraft {
  if (!validateSlug(slug).ok) throw importError('文章目录名称不是有效 Slug')
  if (parsed.meta.slug && parsed.meta.slug !== slug) {
    throw importError('Front Matter 的封面或 slug 与文章目录不一致')
  }

  const cover = media.find((asset) => asset.kind === 'cover')
  if (parsed.coverPath && parsed.coverPath !== `/posts/${slug}/images/cover.webp`) {
    throw importError('Front Matter 封面路径与文章目录不一致')
  }
  if (Boolean(parsed.coverPath) !== Boolean(cover)) {
    throw importError(parsed.coverPath ? 'Front Matter 引用了缺失的封面' : '封面文件缺少 Front Matter 路径')
  }

  const references = validateMediaReferences(parsed.body, media)
  if (references.missing.length > 0) {
    throw importError(`缺少正文图片：${references.missing.join('、')}`)
  }

  const draft = createArticleDraft()
  const complete = {
    ...draft,
    meta: { ...parsed.meta, slug },
    body: parsed.body,
    media,
  }
  try { assertCompleteArticleMeta(complete.meta) } catch (error) {
    throw importError(error instanceof Error ? error.message : '文章元数据无效')
  }
  return complete
}

function inspectArchiveEntries(entries: Entry[]): { root: string; index: FileEntry; images: FileEntry[] } {
  validateArchiveEntries(entries)
  const files = entries.filter((entry): entry is FileEntry => !entry.directory)
  for (const entry of files) assertSupportedEntry(entry)
  const paths = files
    .filter((entry) => !isMacOsMetadataPath(entry.filename))
    .map((entry) => ({ entry, path: validateArchivePath(entry.filename) }))

  const roots = new Set(paths.map(({ path }) => path.root))
  if (roots.size !== 1) throw importError('ZIP 必须只包含一个文章目录')
  const root = paths[0]?.path.root
  if (!root || !validateSlug(root).ok) throw importError('文章目录名称不是有效 Slug')

  const indexes = paths.filter(({ path }) => path.relative === 'index.md')
  if (indexes.length !== 1) throw importError('ZIP 必须恰好包含一个 <slug>/index.md')

  const images: FileEntry[] = []
  for (const { entry, path } of paths) {
    if (path.relative === 'index.md') continue
    if (!path.relative.startsWith('images/')) {
      throw importError(`ZIP 包含不支持的条目：${entry.filename}`)
    }
    const imageName = path.relative.slice('images/'.length)
    if (imageName.includes('/')) throw importError(`图片不能位于嵌套目录：${entry.filename}`)
    validateImageName(imageName)
    images.push(entry)
  }

  return { root, index: indexes[0].entry, images }
}

export async function importArticleBundle(blob: Blob): Promise<ArticleDraft> {
  const readOptions = { checkSignature: true, checkAmbiguity: true, checkOverlappingEntry: true, strictness: 'strict' as const }
  const reader = new ZipReader(new BlobReader(blob), readOptions)
  try {
    const entries = await reader.getEntries()
    const { root, index, images } = inspectArchiveEntries(entries)
    const source = await index.getData(new TextWriter(), readOptions)
    const parsed = parseImportedArticle(source)
    const media: MediaAsset[] = []
    for (const entry of images) {
      const writer = new BlobWriter()
      await entry.getData(writer, readOptions)
      const bytes = new Uint8Array(await (await writer.getData()).arrayBuffer())
      media.push(await createMedia(validateArchivePath(entry.filename).relative.slice('images/'.length), bytes))
    }
    return draftFromParsed(parsed, root, media.sort((left, right) => left.name.localeCompare(right.name)))
  } finally {
    await reader.close().catch(() => undefined)
  }
}

export async function importLooseArticle(indexFile: File, images: File[]): Promise<ArticleDraft> {
  if (indexFile.name !== 'index.md' || indexFile.size > MAX_SOURCE_BYTES) {
    throw importError('请选择不超过 25 MiB 的 index.md 文件')
  }
  if (images.length + 1 > MAX_ARCHIVE_ENTRIES) {
    throw importError(`文件数不能超过 ${MAX_ARCHIVE_ENTRIES}`)
  }

  let total = indexFile.size
  const names = new Set<string>()
  for (const image of images) {
    if (image.size > MAX_ARCHIVE_FILE_BYTES) throw importError(`图片超过 25 MiB：${image.name}`)
    total += image.size
    if (total > MAX_ARCHIVE_TOTAL_BYTES) throw importError('导入总大小不能超过 250 MiB')
    validateImageName(image.name)
    if (names.has(image.name)) throw importError(`图片名称重复：${image.name}`)
    names.add(image.name)
  }

  const parsed = parseImportedArticle(await indexFile.text())
  if (!parsed.meta.slug) {
    throw importError('无封面时，独立导入的 index.md 必须声明 slug')
  }
  const media: MediaAsset[] = []
  for (const image of images) media.push(await createMedia(image.name, new Uint8Array(await image.arrayBuffer())))
  return draftFromParsed(parsed, parsed.meta.slug, media.sort((left, right) => left.name.localeCompare(right.name)))
}

import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter, type Entry, type FileEntry } from '@zip.js/zip.js'
import type { ArticleDraft, ArticleMeta, MediaAsset, MediaKind, MediaMime } from '../metadata/article'
import { validateArchiveEntries, validateArchivePath } from './archive-path'

const FORMAT = 'imx-post-studio-recovery-v1'
const MIME_TYPES = new Set<MediaMime>(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MEDIA_KINDS = new Set<MediaKind>(['cover', 'body'])
const readOptions = { checkSignature: true, checkAmbiguity: true, checkOverlappingEntry: true, strictness: 'strict' as const }

interface RecoveryMedia {
  id: string
  name: string
  kind: MediaAsset['kind']
  mime: MediaAsset['mime']
  width?: number
  height?: number
  blobType: string
  path: string
  bytes: number
}

interface RecoveryPayload {
  format: typeof FORMAT
  draft: Omit<ArticleDraft, 'media'>
  media: RecoveryMedia[]
}

type JsonRecord = Record<string, unknown>

function recoveryError(message: string): Error {
  return new Error(`无法恢复紧急备份：${message}`)
}

function payloadFor(draft: ArticleDraft): RecoveryPayload {
  const draftWithoutMedia: Omit<ArticleDraft, 'media'> = {
    id: draft.id,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    meta: { ...draft.meta, categories: [...draft.meta.categories], tags: [...draft.meta.tags] },
    body: draft.body,
  }
  return {
    format: FORMAT,
    draft: draftWithoutMedia,
    media: draft.media.map((asset, index) => ({
      id: asset.id, name: asset.name, kind: asset.kind, mime: asset.mime, width: asset.width, height: asset.height,
      blobType: asset.blob.type, path: `media/${index}`, bytes: asset.blob.size,
    })),
  }
}

export async function exportRecoveryBundle(draft: ArticleDraft): Promise<Blob> {
  const payload = payloadFor(draft)
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  let closed = false
  try {
    await writer.add('recovery.json', new TextReader(JSON.stringify(payload)))
    for (let index = 0; index < draft.media.length; index += 1) {
      await writer.add(`media/${index}`, new BlobReader(draft.media[index].blob))
    }
    const result = await writer.close()
    closed = true
    return result
  } finally {
    if (!closed) await writer.close().catch(() => undefined)
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: JsonRecord, required: string[], optional: string[] = []): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validDimension(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
}

function parseMeta(value: unknown): ArticleMeta {
  if (!isRecord(value) || !hasExactKeys(value, ['title', 'slug', 'date', 'draft', 'categories', 'tags', 'description', 'toc'])
    || typeof value.title !== 'string' || typeof value.slug !== 'string' || typeof value.date !== 'string'
    || typeof value.draft !== 'boolean' || !isStringArray(value.categories) || !isStringArray(value.tags)
    || typeof value.description !== 'string' || typeof value.toc !== 'boolean') {
    throw recoveryError('备份元数据格式无效')
  }
  return {
    title: value.title, slug: value.slug, date: value.date, draft: value.draft,
    categories: [...value.categories], tags: [...value.tags], description: value.description, toc: value.toc,
  }
}

function parseDraft(value: unknown): Omit<ArticleDraft, 'media'> {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'createdAt', 'updatedAt', 'meta', 'body'])
    || typeof value.id !== 'string' || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' || typeof value.body !== 'string') {
    throw recoveryError('备份草稿格式无效')
  }
  return { id: value.id, createdAt: value.createdAt, updatedAt: value.updatedAt, meta: parseMeta(value.meta), body: value.body }
}

function parseMedia(value: unknown, index: number): RecoveryMedia {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'name', 'kind', 'mime', 'blobType', 'path', 'bytes'], ['width', 'height'])
    || typeof value.id !== 'string' || typeof value.name !== 'string' || !MEDIA_KINDS.has(value.kind as MediaKind)
    || !MIME_TYPES.has(value.mime as MediaMime) || typeof value.blobType !== 'string'
    || value.path !== `media/${index}` || typeof value.bytes !== 'number' || !Number.isSafeInteger(value.bytes) || value.bytes < 0
    || !validDimension(value.width) || !validDimension(value.height)) {
    throw recoveryError('媒体清单无效')
  }
  return {
    id: value.id, name: value.name, kind: value.kind as MediaKind, mime: value.mime as MediaMime,
    ...(value.width === undefined ? {} : { width: value.width as number }),
    ...(value.height === undefined ? {} : { height: value.height as number }),
    blobType: value.blobType, path: value.path, bytes: value.bytes,
  }
}

function parsePayload(value: unknown): RecoveryPayload {
  if (!isRecord(value) || !hasExactKeys(value, ['format', 'draft', 'media']) || value.format !== FORMAT || !Array.isArray(value.media)) {
    throw recoveryError('这不是 IMX Post Studio 紧急备份')
  }
  const media = value.media.map((record, index) => parseMedia(record, index))
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const record of media) {
    if (!record.id || !record.name || ids.has(record.id) || names.has(record.name)) throw recoveryError('媒体清单包含重复或空标识')
    ids.add(record.id)
    names.add(record.name)
  }
  return { format: FORMAT, draft: parseDraft(value.draft), media }
}

function assertSupportedEntry(entry: Entry): void {
  if (entry.encrypted || entry.zipCrypto) throw recoveryError(`不支持加密 ZIP 条目：${entry.filename}`)
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw recoveryError(`不支持的 ZIP 压缩方法：${entry.filename}`)
  }
  if (entry.unixMode !== undefined) {
    const fileType = entry.unixMode & 0o170000
    if (fileType === 0o120000) throw recoveryError(`不支持符号链接条目：${entry.filename}`)
    if (fileType !== 0 && fileType !== 0o100000) throw recoveryError(`不支持的 Unix 非常规文件：${entry.filename}`)
  }
}

function inspectEntries(entries: Entry[]): { files: FileEntry[]; manifest: FileEntry } {
  try {
    validateArchiveEntries(entries)
    for (const entry of entries) validateArchivePath(entry.filename)
  } catch (cause) {
    throw recoveryError(cause instanceof Error ? cause.message : 'ZIP 条目无效')
  }
  const files = entries.filter((entry): entry is FileEntry => !entry.directory)
  const paths = new Set<string>()
  for (const entry of files) {
    assertSupportedEntry(entry)
    const key = entry.filename.toLocaleLowerCase('en-US')
    if (paths.has(key)) throw recoveryError(`ZIP 包含大小写冲突条目：${entry.filename}`)
    paths.add(key)
    if (entry.filename !== 'recovery.json' && !/^media\/\d+$/.test(entry.filename)) {
      throw recoveryError(`ZIP 包含不支持的条目：${entry.filename}`)
    }
  }
  const manifests = files.filter((entry) => entry.filename === 'recovery.json')
  if (manifests.length !== 1) throw recoveryError('ZIP 必须恰好包含一个 recovery.json')
  return { files, manifest: manifests[0] }
}

function inspectLayout(files: FileEntry[], payload: RecoveryPayload): FileEntry[] {
  if (files.length !== payload.media.length + 1) throw recoveryError('ZIP 条目与媒体清单不一致')
  const expected = new Set(['recovery.json', ...payload.media.map((record) => record.path)])
  if (expected.size !== files.length || files.some((entry) => !expected.has(entry.filename))) {
    throw recoveryError('ZIP 条目与媒体清单不一致')
  }
  return payload.media.map((record) => {
    const entry = files.find((candidate) => candidate.filename === record.path)
    if (!entry || entry.uncompressedSize !== record.bytes) throw recoveryError(`媒体字节数不匹配：${record.path}`)
    return entry
  })
}

export async function importRecoveryBundle(blob: Blob): Promise<ArticleDraft> {
  const reader = new ZipReader(new BlobReader(blob), readOptions)
  try {
    const { files, manifest } = inspectEntries(await reader.getEntries())
    const payload = parsePayload(JSON.parse(await manifest.getData(new TextWriter(), readOptions)))
    const mediaEntries = inspectLayout(files, payload)
    const media = await Promise.all(payload.media.map(async (record, index) => {
      const data = await mediaEntries[index].getData(new BlobWriter(record.blobType), readOptions)
      if (data.size !== record.bytes) throw recoveryError(`媒体字节数不匹配：${record.path}`)
      return {
        id: record.id, name: record.name, kind: record.kind, mime: record.mime,
        width: record.width, height: record.height, blob: data,
      }
    }))
    return { ...payload.draft, meta: { ...payload.draft.meta, categories: [...payload.draft.meta.categories], tags: [...payload.draft.meta.tags] }, media }
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('无法恢复紧急备份')) throw cause
    throw recoveryError(cause instanceof Error ? cause.message : 'ZIP 文件无效')
  } finally {
    await reader.close().catch(() => undefined)
  }
}

export { FORMAT as RECOVERY_BUNDLE_FORMAT }

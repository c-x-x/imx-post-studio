import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter, type FileEntry } from '@zip.js/zip.js'
import type { ArticleDraft, MediaAsset } from '../metadata/article'

const FORMAT = 'imx-post-studio-recovery-v1'

interface RecoveryMedia {
  id: string
  name: string
  kind: MediaAsset['kind']
  mime: MediaAsset['mime']
  width?: number
  height?: number
  blobType: string
  path: string
}

interface RecoveryPayload {
  format: typeof FORMAT
  draft: Omit<ArticleDraft, 'media'>
  media: RecoveryMedia[]
}

function recoveryError(message: string): Error {
  return new Error(`无法恢复紧急备份：${message}`)
}

function payloadFor(draft: ArticleDraft): RecoveryPayload {
  return {
    format: FORMAT,
    draft: { ...draft, meta: { ...draft.meta, categories: [...draft.meta.categories], tags: [...draft.meta.tags] } },
    media: draft.media.map((asset, index) => ({
      id: asset.id, name: asset.name, kind: asset.kind, mime: asset.mime, width: asset.width, height: asset.height,
      blobType: asset.blob.type, path: `media/${index}`,
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

function parsePayload(value: unknown): RecoveryPayload {
  if (!value || typeof value !== 'object') throw recoveryError('备份清单无效')
  const payload = value as Partial<RecoveryPayload>
  if (payload.format !== FORMAT || !payload.draft || !Array.isArray(payload.media)) {
    throw recoveryError('这不是 IMX Post Studio 紧急备份')
  }
  return payload as RecoveryPayload
}

function entryByName(entries: FileEntry[], name: string): FileEntry {
  const entry = entries.find((candidate) => candidate.filename === name)
  if (!entry) throw recoveryError(`缺少备份文件：${name}`)
  return entry
}

export async function importRecoveryBundle(blob: Blob): Promise<ArticleDraft> {
  const reader = new ZipReader(new BlobReader(blob))
  try {
    const entries = (await reader.getEntries()).filter((entry): entry is FileEntry => !entry.directory)
    const manifest = entryByName(entries, 'recovery.json')
    const payload = parsePayload(JSON.parse(await manifest.getData(new TextWriter())))
    const media = await Promise.all(payload.media.map(async (record) => {
      if (!record || typeof record.path !== 'string' || !record.path.startsWith('media/')) throw recoveryError('媒体清单无效')
      const entry = entryByName(entries, record.path)
      const data = await entry.getData(new BlobWriter(record.blobType))
      return { id: record.id, name: record.name, kind: record.kind, mime: record.mime, width: record.width, height: record.height, blob: data }
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

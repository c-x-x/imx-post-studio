import type { MediaAsset, MediaMime } from '../metadata/article'
import { validateBrowserImage } from './validate-image'
import { MAX_SOURCE_BYTES, MAX_IMAGE_BATCH_BYTES, MAX_IMAGE_BATCH_COUNT } from '../shared/limits'
import { safeMediaName, uniqueMediaName } from './names'

const BODY_TYPES = new Set<MediaMime>(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

interface PreparedSource {
  originalName: string
  mime: MediaMime
  bytes: Uint8Array
}

function acceptedMime(file: File): MediaMime {
  const mime = file.type as MediaMime
  if (!BODY_TYPES.has(mime)) throw new Error('图片格式不受支持：仅支持 JPEG、PNG、WebP 或 GIF')
  return mime
}

async function prepareSource(file: File): Promise<PreparedSource> {
  const mime = acceptedMime(file)
  if (file.size > MAX_SOURCE_BYTES) throw new Error('单个图片不能超过 25 MiB')
  const originalName = safeMediaName(file.name)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = await validateBrowserImage(originalName, bytes)
  if (detected !== mime) throw new Error(`图片 MIME 与内容不一致：${file.name}`)
  return { originalName, mime, bytes }
}

export async function prepareBodyMediaBatch(files: File[], existingNames: ReadonlySet<string>): Promise<MediaAsset[]> {
  if (files.length > MAX_IMAGE_BATCH_COUNT) throw new Error('单次最多添加 50 张图片')
  if (files.reduce((total, file) => total + file.size, 0) > MAX_IMAGE_BATCH_BYTES) throw new Error('单次图片总大小不能超过 100 MiB')
  const sources: PreparedSource[] = []
  // Bound peak decoder memory rather than decoding the whole batch concurrently.
  for (const file of files) sources.push(await prepareSource(file))
  const reservedNames = new Set(existingNames)
  reservedNames.add('cover.webp')
  return sources.map((source) => {
    const name = uniqueMediaName(source.originalName, reservedNames)
    reservedNames.add(name)
    return {
      id: crypto.randomUUID(),
      name,
      kind: 'body' as const,
      mime: source.mime,
      blob: new Blob([new Uint8Array(source.bytes).buffer], { type: source.mime }),
    }
  })
}

import type { MediaAsset, MediaMime } from '../metadata/article.js'
import { safeMediaName } from '../media/names.js'
import { MAX_SOURCE_BYTES, MAX_IMAGE_PIXELS, MAX_IMAGE_DIMENSION } from '../shared/limits.js'
import { readImageDimensions } from './image-dimensions.js'

const MIME_BY_EXTENSION: Record<string, MediaMime> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

export function expectedImageMime(name: string): MediaMime | undefined {
  return MIME_BY_EXTENSION[name.slice(name.lastIndexOf('.') + 1)]
}

export function assertSafeImageName(name: string): MediaMime {
  const mime = expectedImageMime(name)
  if (!name || name.includes('/') || name.includes('\\') || safeMediaName(name) !== name || !mime) {
    throw new Error(`图片名称或格式不受支持：${name}`)
  }
  return mime
}

export function detectImageMime(bytes: Uint8Array): MediaMime | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a') return 'image/gif'
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a') return 'image/gif'
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return undefined
}

export function assertImageBytes(name: string, bytes: Uint8Array): MediaMime {
  const expected = assertSafeImageName(name)
  const detected = detectImageMime(bytes)
  if (!detected || detected !== expected) {
    throw new Error(`图片内容不是与扩展名匹配的受支持图片：${name}`)
  }
  let dimensions
  try { dimensions = readImageDimensions(bytes, detected) } catch {
    throw new Error(`图片数据不完整或已损坏：${name}`)
  }
  assertImageDimensions(dimensions.width, dimensions.height, name)
  return detected
}

export function assertImageDimensions(width: number, height: number, name: string): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`图片尺寸超限或无效：${name}，最多 4000 万像素，单边不超过 ${MAX_IMAGE_DIMENSION}`)
  }
}

export async function assertExportableMedia(asset: MediaAsset): Promise<void> {
  if (asset.blob.size > MAX_SOURCE_BYTES) {
    throw new Error(`图片 ${asset.name} 超过 25 MiB 限制`)
  }
  const expected = assertSafeImageName(asset.name)
  const blobMime = asset.blob.type.toLowerCase().split(';', 1)[0]
  if (asset.mime !== expected || blobMime !== expected) {
    throw new Error(`图片 MIME 与名称不一致：${asset.name}`)
  }
  const bytes = new Uint8Array(await asset.blob.arrayBuffer())
  if (assertImageBytes(asset.name, bytes) !== asset.mime) {
    throw new Error(`图片 MIME 与内容不一致：${asset.name}`)
  }
}

import { MAX_SOURCE_BYTES } from '../shared/limits'

const COVER_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const COVER_ASPECT_RATIO = 16 / 9
const DEFAULT_MAX_COVER_WIDTH = 1600
const DEFAULT_COVER_QUALITY = 82

export interface NormalizedCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface RenderedCover {
  blob: Blob
  width: number
  height: number
}

export interface CoverRenderOptions {
  maxWidth?: number
  quality?: number
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function normalizedCrop(bitmap: ImageBitmap, crop: NormalizedCrop) {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)) {
    throw new Error('封面裁剪区域无效，请重新调整裁剪框')
  }

  const x = clamp(crop.x)
  const y = clamp(crop.y)
  const xPixels = x * bitmap.width
  const yPixels = y * bitmap.height
  let width = Math.min(clamp(crop.width) * bitmap.width, bitmap.width - xPixels)
  let height = Math.min(clamp(crop.height) * bitmap.height, bitmap.height - yPixels)

  if (width <= 0 || height <= 0) {
    throw new Error('封面裁剪区域无效，请重新调整裁剪框')
  }

  const ratio = width / height
  let offsetX = 0
  let offsetY = 0
  if (ratio > COVER_ASPECT_RATIO) {
    const croppedWidth = height * COVER_ASPECT_RATIO
    offsetX = (width - croppedWidth) / 2
    width = croppedWidth
  } else if (ratio < COVER_ASPECT_RATIO) {
    const croppedHeight = width / COVER_ASPECT_RATIO
    offsetY = (height - croppedHeight) / 2
    height = croppedHeight
  }

  return {
    x: xPixels + offsetX,
    y: yPixels + offsetY,
    width,
    height,
  }
}

function coverDimensions(crop: { width: number; height: number }, maxWidth: number) {
  const boundedWidth = Number.isInteger(maxWidth) && maxWidth >= 16 && maxWidth <= DEFAULT_MAX_COVER_WIDTH
    ? maxWidth : DEFAULT_MAX_COVER_WIDTH
  const maxHeight = boundedWidth / COVER_ASPECT_RATIO
  const multiple = Math.min(
    Math.floor(crop.width / 16),
    Math.floor(crop.height / 9),
    Math.floor(boundedWidth / 16),
    Math.floor(maxHeight / 9),
  )
  if (multiple < 1) {
    throw new Error('封面裁剪区域过小，至少需要 16×9 像素，请重新调整裁剪框')
  }

  return {
    width: multiple * 16,
    height: multiple * 9,
  }
}

function encodeWithCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob?.type === 'image/webp' && blob.size > 0) {
        resolve(blob)
      } else {
        resolve(undefined)
      }
    }, 'image/webp', quality / 100)
  })
}

async function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const native = await encodeWithCanvas(canvas, quality)
  if (native) return native

  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D canvas is unavailable')
    const { encode } = await import('@jsquash/webp')
    const bytes = await encode(context.getImageData(0, 0, canvas.width, canvas.height), { quality })
    const fallback = new Blob([bytes], { type: 'image/webp' })
    if (fallback.size > 0) return fallback
  } catch {
    // Keep the user-facing error below stable across native and WASM encoders.
  }

  throw new Error('封面转换失败：浏览器未生成有效 WebP 文件，请使用兼容浏览器或更换图片后重试')
}

export async function renderCover(
  source: Blob,
  crop: NormalizedCrop,
  options: CoverRenderOptions = {},
): Promise<RenderedCover> {
  if (!COVER_MIME_TYPES.has(source.type)) {
    throw new Error('封面仅支持 JPEG、PNG 或 WebP 图片，请选择其他图片后重试')
  }
  if (source.size > MAX_SOURCE_BYTES) {
    throw new Error('封面文件不能超过 25 MiB，请压缩图片后重试')
  }

  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(source)
    const sourceCrop = normalizedCrop(bitmap, crop)
    const quality = Number.isInteger(options.quality) && options.quality! >= 60 && options.quality! <= 95
      ? options.quality! : DEFAULT_COVER_QUALITY
    const { width, height } = coverDimensions(sourceCrop, options.maxWidth ?? DEFAULT_MAX_COVER_WIDTH)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('浏览器无法处理封面，请更换浏览器或图片后重试')
    }

    context.drawImage(
      bitmap,
      sourceCrop.x,
      sourceCrop.y,
      sourceCrop.width,
      sourceCrop.height,
      0,
      0,
      width,
      height,
    )
    return { blob: await encodeWebp(canvas, quality), width, height }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('封面')) {
      throw error
    }
    throw new Error('封面转换失败，请更换图片后重试', { cause: error })
  } finally {
    try {
      bitmap?.close()
    } catch {
      // Closing a decoded browser bitmap is best effort.
    }
  }
}

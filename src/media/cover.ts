import { MAX_SOURCE_BYTES } from '../shared/limits'

const COVER_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const COVER_ASPECT_RATIO = 16 / 9
const MAX_COVER_WIDTH = 1600
const MAX_COVER_HEIGHT = 900

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

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function normalizedCrop(bitmap: ImageBitmap, crop: NormalizedCrop) {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)) {
    throw new Error('封面裁剪区域无效，请重新调整裁剪框')
  }

  const x = clamp(crop.x)
  const y = clamp(crop.y)
  let width = Math.min(clamp(crop.width), 1 - x) * bitmap.width
  let height = Math.min(clamp(crop.height), 1 - y) * bitmap.height

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
    x: x * bitmap.width + offsetX,
    y: y * bitmap.height + offsetY,
    width,
    height,
  }
}

function coverDimensions(crop: { width: number; height: number }) {
  const scale = Math.min(1, MAX_COVER_WIDTH / crop.width, MAX_COVER_HEIGHT / crop.height)
  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  }
}

function encodeWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('浏览器未能生成封面文件'))
      }
    }, 'image/webp', 0.82)
  })
}

export async function renderCover(
  source: Blob,
  crop: NormalizedCrop,
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
    const { width, height } = coverDimensions(sourceCrop)
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
    return { blob: await encodeWebp(canvas), width, height }
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

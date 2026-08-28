import sharp from 'sharp'
import { assertImageBytes } from '../../src/bundles/media-validation.js'
import { MAX_IMAGE_PIXELS } from '../../src/shared/limits.js'

export async function validateDecodedImage(name: string, bytes: Uint8Array) {
  const mime = assertImageBytes(name, bytes)
  try {
    // Decode all frames within one cumulative pixel budget; never trust headers alone.
    await sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS, animated: true })
      .resize(1, 1, { fit: 'inside' }).raw().toBuffer()
  } catch {
    throw new Error(`图片无法解码或尺寸无效：${name}`)
  }
  return mime
}

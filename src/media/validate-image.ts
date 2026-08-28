import { assertImageBytes, assertImageDimensions } from '../bundles/media-validation'

/** Check dimensions before invoking a decoder, then reject damaged pixel data. */
export async function validateBrowserImage(name: string, bytes: Uint8Array) {
  const mime = assertImageBytes(name, bytes)
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: mime })
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob)
      try { assertImageDimensions(bitmap.width, bitmap.height, name) } finally { bitmap.close() }
    } else {
      const url = URL.createObjectURL(blob)
      try {
        const image = new Image()
        image.src = url
        await image.decode()
        assertImageDimensions(image.naturalWidth, image.naturalHeight, name)
      } finally { URL.revokeObjectURL(url) }
    }
  } catch {
    throw new Error(`图片无法解码或尺寸无效：${name}，请更换完整的图片文件`)
  }
  return mime
}

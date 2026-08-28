import type { MediaMime } from '../metadata/article.js'

/** Allocation-free header inspection before decoding pixels. Only our four formats
 * are parsed; variable-length scans must advance and stay within the input. */
export function readImageDimensions(bytes: Uint8Array, mime: MediaMime): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const invalid = () => new Error('Invalid image header')
  const fourCC = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (mime === 'image/png') {
    if (view.byteLength < 33 || view.getUint32(8) !== 13 || fourCC(12) !== 'IHDR') throw invalid()
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (mime === 'image/gif') {
    if (view.byteLength < 13) throw invalid()
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  if (mime === 'image/webp') {
    const end = view.getUint32(4, true) + 8
    if (end > bytes.length || end < 20) throw invalid()
    for (let at = 12; at + 8 <= end;) {
      const type = fourCC(at)
      const size = view.getUint32(at + 4, true)
      const start = at + 8
      if (size > end - start) throw invalid()
      if (type === 'VP8X' && size >= 10) {
        const uint24 = (offset: number) => view.getUint16(offset, true) + (view.getUint8(offset + 2) << 16)
        return { width: uint24(start + 4) + 1, height: uint24(start + 7) + 1 }
      }
      if (type === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
        const bits = view.getUint32(start + 1, true)
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
      }
      if (type === 'VP8 ' && size >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2a) {
        return { width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff }
      }
      at = start + size + (size % 2)
    }
    throw invalid()
  }
  if (mime === 'image/jpeg') {
    for (let at = 2; at < bytes.length;) {
      if (bytes[at++] !== 0xff) throw invalid()
      while (at < bytes.length && bytes[at] === 0xff) at++
      if (at >= bytes.length) throw invalid()
      const marker = bytes[at++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
      if (at + 2 > bytes.length) throw invalid()
      const size = view.getUint16(at)
      if (size < 2 || size > bytes.length - at) throw invalid()
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (size < 8) throw invalid()
        return { width: view.getUint16(at + 5), height: view.getUint16(at + 3) }
      }
      at += size
    }
  }
  throw invalid()
}

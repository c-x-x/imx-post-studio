import { deflateSync } from 'node:zlib'

export interface TestFilePayload {
  name: string
  mimeType: string
  buffer: Buffer
}

function crc32(bytes: Buffer): number {
  let value = 0xffff_ffff
  for (const byte of bytes) {
    value ^= byte
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb8_8320 : 0)
  }
  return (value ^ 0xffff_ffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii')
  const result = Buffer.allocUnsafe(data.length + 12)
  result.writeUInt32BE(data.length, 0)
  name.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8)
  return result
}

/** A valid, deterministic RGBA PNG generated in test code rather than checked-in binary media. */
export function createPngBuffer(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number] = [27, 94, 162, 255],
): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('PNG dimensions must be positive integers')
  }
  const row = Buffer.alloc(1 + width * 4)
  for (let offset = 1; offset < row.length; offset += 4) {
    row[offset] = rgba[0]
    row[offset + 1] = rgba[1]
    row[offset + 2] = rgba[2]
    row[offset + 3] = rgba[3]
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const header = Buffer.allocUnsafe(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

export function pngFile(
  name: string,
  width: number,
  height: number,
  color?: readonly [number, number, number, number],
): TestFilePayload {
  return { name, mimeType: 'image/png', buffer: createPngBuffer(width, height, color) }
}

export function oversizedPngFile(name = 'too-large.png'): TestFilePayload {
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
  }
}

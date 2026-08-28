import { createPngBuffer, tinyWebpBytes } from '../helpers/test-images'
import { describe, expect, it, vi } from 'vitest'
import { prepareBodyMediaBatch } from '../../src/media/intake'
import { validateDecodedImage } from '../../server/github/image-validation'
import sharp from 'sharp'
import { readImageDimensions } from '../../src/bundles/image-dimensions'

const png = new Uint8Array(createPngBuffer(1, 1))
const webp = tinyWebpBytes

describe('prepareBodyMediaBatch', () => {
  it('reads bounded dimensions for supported formats and decodes real images', async () => {
    const input = createPngBuffer(7, 5)
    const cases = [
      ['test.jpg', 'image/jpeg', await sharp(input).jpeg({ progressive: true }).toBuffer()],
      ['test.gif', 'image/gif', await sharp(input).gif().toBuffer()],
      ['test.webp', 'image/webp', await sharp(input).webp().toBuffer()],
      ['test.webp', 'image/webp', await sharp(input).webp({ lossless: true }).toBuffer()],
      ['test.webp', 'image/webp', await sharp(input).ensureAlpha(0.5).webp().toBuffer()],
    ] as const
    for (const [name, mime, bytes] of cases) {
      expect(readImageDimensions(bytes, mime)).toEqual({ width: 7, height: 5 })
      await expect(validateDecodedImage(name, bytes)).resolves.toBe(mime)
      await expect(prepareBodyMediaBatch([new File([new Uint8Array(bytes)], name, { type: mime })], new Set())).resolves.toHaveLength(1)
    }
    expect(() => readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'image/jpeg')).toThrow()
  })
  it('rejects signature-only files, damaged pixel data and oversized image dimensions', async () => {
    const broken = new File([png.slice(0, 8)], 'broken.png', { type: 'image/png' })
    await expect(prepareBodyMediaBatch([broken], new Set())).rejects.toThrow('损坏')
    const truncated = new Uint8Array(createPngBuffer(10, 10)).slice(0, 40)
    await expect(prepareBodyMediaBatch([new File([truncated], 'bad.png', { type: 'image/png' })], new Set())).rejects.toThrow('解码')
    await expect(validateDecodedImage('bad.png', truncated)).rejects.toThrow('解码')
    const huge = new Uint8Array(createPngBuffer(1, 1))
    new DataView(huge.buffer).setUint32(16, 100_000)
    await expect(prepareBodyMediaBatch([new File([huge], 'huge.png', { type: 'image/png' })], new Set())).rejects.toThrow('尺寸')
    await expect(validateDecodedImage('huge.png', huge)).rejects.toThrow('尺寸')
    await expect(validateDecodedImage('valid.png', png)).resolves.toBe('image/png')
  })

  it('enforces batch limits before allocating file buffers', async () => {
    const file = new File([png], 'a.png', { type: 'image/png' })
    const read = vi.spyOn(file, 'arrayBuffer')
    await expect(prepareBodyMediaBatch(Array(51).fill(file), new Set())).rejects.toThrow('50')
    Object.defineProperty(file, 'size', { value: 25 * 1024 * 1024 })
    await expect(prepareBodyMediaBatch(Array(5).fill(file), new Set())).rejects.toThrow('100 MiB')
    expect(read).not.toHaveBeenCalled()
  })
  it('does not allocate any media when a later file in the batch is invalid', async () => {
    const existing = new Set(['cover.webp'])
    const valid = new File([png], 'diagram.png', { type: 'image/png' })
    const invalid = new File(['not an image'], 'bad.png', { type: 'image/png' })

    await expect(prepareBodyMediaBatch([valid, invalid], existing)).rejects.toThrow('图片')
    expect(existing).toEqual(new Set(['cover.webp']))
  })

  it('reserves cover.webp and allocates stable unique names for the whole batch', async () => {
    const files = [
      new File([webp], 'cover.webp', { type: 'image/webp' }),
      new File([webp], 'cover.webp', { type: 'image/webp' }),
      new File([png], '配置 图.PNG', { type: 'image/png' }),
    ]

    const assets = await prepareBodyMediaBatch(files, new Set(['cover.webp']))

    expect(assets.map((asset) => asset.name)).toEqual(['cover-2.webp', 'cover-3.webp', 'pei-zhi-tu.png'])
    expect(assets.every((asset) => asset.kind === 'body')).toBe(true)
  })
})

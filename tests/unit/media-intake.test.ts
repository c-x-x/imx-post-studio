import { describe, expect, it } from 'vitest'
import { prepareBodyMediaBatch } from '../../src/media/intake'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])

describe('prepareBodyMediaBatch', () => {
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

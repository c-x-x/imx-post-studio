import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../src/metadata/article'
import { renderCover } from '../../src/media/cover'
import { ObjectUrlRegistry } from '../../src/media/object-urls'

function stubCanvas() {
  const drawImage = vi.fn()
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback, type) => {
      callback(new Blob(['converted'], { type }))
    })

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)

  return { toBlob }
}

function imageAsset(id: string, blob: Blob): MediaAsset {
  return {
    id,
    name: 'photo.png',
    kind: 'body',
    mime: 'image/png',
    blob,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('cover rendering', () => {
  it('renders a cropped large source as a bounded WebP cover', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2000, height: 1200, close }))
    const { toBlob } = stubCanvas()

    const result = await renderCover(
      new Blob(['source'], { type: 'image/png' }),
      { x: 0, y: 0, width: 1, height: 1 },
    )

    expect(result.blob.type).toBe('image/webp')
    expect(result.width).toBe(1600)
    expect(result.height).toBe(900)
    expect(result.blob.size).toBeGreaterThan(0)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82)
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not upscale a source that already fits the cover bounds', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 640, height: 360, close }))
    stubCanvas()

    const result = await renderCover(
      new Blob(['source'], { type: 'image/jpeg' }),
      { x: 0, y: 0, width: 1, height: 1 },
    )

    expect(result.width).toBe(640)
    expect(result.height).toBe(360)
  })

  it('closes a decoded bitmap when WebP encoding fails', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 640, height: 360, close }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))

    await expect(
      renderCover(new Blob(['source'], { type: 'image/webp' }), { x: 0, y: 0, width: 1, height: 1 }),
    ).rejects.toThrow('封面转换失败')

    expect(close).toHaveBeenCalledOnce()
  })
})

describe('object URL registry', () => {
  it('keeps an unchanged asset URL stable and revokes its replacement', () => {
    const createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const registry = new ObjectUrlRegistry()
    const first = imageAsset('photo', new Blob(['first'], { type: 'image/png' }))
    const replacement = imageAsset('photo', new Blob(['second'], { type: 'image/png' }))

    expect(registry.get(first)).toBe('blob:first')
    expect(registry.get(first)).toBe('blob:first')
    expect(registry.get(replacement)).toBe('blob:second')
    expect(registry.revoke('photo')).toBeUndefined()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second')
  })

  it('revokes every remaining URL when disposed', () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second'),
      revokeObjectURL: vi.fn(),
    })
    const registry = new ObjectUrlRegistry()

    registry.get(imageAsset('first', new Blob(['first'], { type: 'image/png' })))
    registry.get(imageAsset('second', new Blob(['second'], { type: 'image/png' })))
    registry.dispose()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second')
  })
})

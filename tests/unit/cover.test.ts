import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../src/metadata/article'
import { renderCover } from '../../src/media/cover'
import { ObjectUrlRegistry } from '../../src/media/object-urls'
import { MAX_SOURCE_BYTES } from '../../src/shared/limits'

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

function decodedBitmap(width = 640, height = 360) {
  return { width, height, close: vi.fn() }
}

function stubDecodedBitmap(bitmap = decodedBitmap()) {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  return bitmap
}

function source(type = 'image/png', bytes = 'source') {
  return new Blob([bytes], { type })
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

  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s cover sources', async (type) => {
    stubDecodedBitmap()
    stubCanvas()

    await expect(renderCover(source(type), { x: 0, y: 0, width: 1, height: 1 })).resolves.toMatchObject({
      width: 640,
      height: 360,
    })
  })

  it.each(['image/gif', 'image/svg+xml', ''])('rejects unsupported %s cover sources', async (type) => {
    await expect(renderCover(source(type), { x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow('封面仅支持')
  })

  it('accepts exactly 25 MiB and rejects one byte more', async () => {
    stubDecodedBitmap()
    stubCanvas()
    await expect(
      renderCover(new Blob([new Uint8Array(MAX_SOURCE_BYTES)], { type: 'image/png' }), { x: 0, y: 0, width: 1, height: 1 }),
    ).resolves.toMatchObject({ width: 640, height: 360 })

    await expect(
      renderCover(new Blob([new Uint8Array(MAX_SOURCE_BYTES + 1)], { type: 'image/png' }), { x: 0, y: 0, width: 1, height: 1 }),
    ).rejects.toThrow('不能超过 25 MiB')
  })

  it('returns a paired integer 16:9 size for an odd source without upscaling', async () => {
    stubDecodedBitmap(decodedBitmap(1001, 563))
    stubCanvas()

    const result = await renderCover(source(), { x: 0, y: 0, width: 1, height: 1 })

    expect(result).toMatchObject({ width: 992, height: 558 })
    expect(result.width / 16).toBe(result.height / 9)
  })

  it('clamps an edge crop and produces an in-bounds 16:9 cover', async () => {
    stubDecodedBitmap(decodedBitmap(2000, 1200))
    stubCanvas()

    await expect(renderCover(source(), { x: 0.8, y: 0, width: 0.5, height: 1 })).resolves.toMatchObject({
      width: 400,
      height: 225,
    })
  })

  it.each([
    [4000, 2000, 'width-bound source'],
    [2000, 4000, 'height-bound source'],
  ])('bounds a %s by %s %s at the maximum cover size', async (width, height) => {
    stubDecodedBitmap(decodedBitmap(width, height))
    stubCanvas()

    await expect(renderCover(source(), { x: 0, y: 0, width: 1, height: 1 })).resolves.toMatchObject({
      width: 1600,
      height: 900,
    })
  })

  it.each([
    [{ x: Number.NaN, y: 0, width: 1, height: 1 }, 'non-finite crop'],
    [{ x: 2, y: 0, width: 1, height: 1 }, 'out-of-bounds crop'],
    [{ x: 0, y: 0, width: 0.01, height: 0.01 }, 'too-small crop'],
  ])('rejects a %s and closes the decoded bitmap', async (crop) => {
    const bitmap = stubDecodedBitmap(decodedBitmap(640, 360))

    await expect(renderCover(source(), crop)).rejects.toThrow('封面裁剪区域')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('closes a decoded bitmap when no canvas context is available', async () => {
    const bitmap = stubDecodedBitmap()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    await expect(renderCover(source(), { x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow('封面转换失败')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('closes a decoded bitmap when drawing fails', async () => {
    const bitmap = stubDecodedBitmap()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(() => { throw new Error('draw failed') }),
    } as unknown as CanvasRenderingContext2D)

    await expect(renderCover(source(), { x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow('封面转换失败')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it.each([
    { encodedBlob: new Blob(['png'], { type: 'image/png' }), label: 'wrong MIME output' },
    { encodedBlob: new Blob([], { type: 'image/webp' }), label: 'empty WebP output' },
  ])('rejects $label and closes the decoded bitmap', async ({ encodedBlob }) => {
    const bitmap = stubDecodedBitmap()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(encodedBlob))

    await expect(renderCover(source(), { x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow('封面转换失败')
    expect(bitmap.close).toHaveBeenCalledOnce()
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

  it('keeps the current URL usable when replacement URL creation fails', () => {
    const createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockImplementationOnce(() => {
      throw new Error('allocation failed')
    })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const registry = new ObjectUrlRegistry()
    const first = imageAsset('photo', new Blob(['first'], { type: 'image/png' }))
    const replacement = imageAsset('photo', new Blob(['second'], { type: 'image/png' }))

    expect(registry.get(first)).toBe('blob:first')
    expect(() => registry.get(replacement)).toThrow('allocation failed')
    expect(registry.get(first)).toBe('blob:first')
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })
})

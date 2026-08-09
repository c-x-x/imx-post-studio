import { describe, expect, it } from 'vitest'
import { mediaAlt, safeMediaName, uniqueMediaName } from '../../src/media/names'

describe('safe media names', () => {
  it('transliterates Chinese names and preserves a supported lowercase extension', () => {
    expect(safeMediaName('配置 截图 01.PNG')).toBe('pei-zhi-jie-tu-01.png')
  })

  it('normalizes jpeg and falls back to image for unsafe source names', () => {
    expect(safeMediaName('Camera.JPEG')).toBe('camera.jpg')
    expect(safeMediaName('...svg')).toBe('image')
  })

  it('adds the next numeric suffix before an extension that is already in use', () => {
    expect(uniqueMediaName('image.png', new Set(['image.png']))).toBe('image-2.png')
  })

  it('keeps escalating collision suffixes until it finds an available name', () => {
    expect(uniqueMediaName('image.png', new Set(['image.png', 'image-2.png', 'image-3.png']))).toBe('image-4.png')
  })

  it('turns a safe media filename into readable image alt text', () => {
    expect(mediaAlt('pei-zhi-tu.png')).toBe('pei zhi tu')
    expect(mediaAlt('---.png')).toBe('image')
  })
})

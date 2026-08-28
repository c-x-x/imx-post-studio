import '@testing-library/jest-dom/vitest'

// jsdom has no image decoder. Exercise real image data rather than accepting
// signature-only fixtures; browser E2E still uses the native browser decoder.
Object.defineProperty(globalThis, 'createImageBitmap', {
  configurable: true,
  writable: true,
  value: async (blob: Blob) => {
    const { default: sharp } = await import('sharp')
    const { info } = await sharp(new Uint8Array(await blob.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .raw().toBuffer({ resolveWithObject: true })
    return { width: info.width, height: info.height, close() {} }
  },
})

const memoryStorage = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => memoryStorage.set(key, value),
    removeItem: (key: string) => memoryStorage.delete(key),
  },
})

if (!Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [] })
}
if (!Range.prototype.getBoundingClientRect) {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    value: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 }),
  })
}

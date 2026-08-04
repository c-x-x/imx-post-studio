import '@testing-library/jest-dom/vitest'

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

import { describe, expect, it } from 'vitest'
import { readActionsCollapsed, writeActionsCollapsed } from '../../src/app/action-rail-preference'

describe('article action rail preference', () => {
  it('reads and writes the collapsed state using a stable browser key', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    expect(readActionsCollapsed(storage)).toBe(false)
    writeActionsCollapsed(true, storage)
    expect(readActionsCollapsed(storage)).toBe(true)
    writeActionsCollapsed(false, storage)
    expect(readActionsCollapsed(storage)).toBe(false)
  })

  it('falls back safely when preference storage is unavailable', () => {
    expect(readActionsCollapsed({ getItem: () => { throw new Error('blocked') } })).toBe(false)
    expect(() => writeActionsCollapsed(true, { setItem: () => { throw new Error('blocked') } })).not.toThrow()
  })
})

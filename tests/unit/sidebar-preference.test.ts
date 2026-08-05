import { describe, expect, it } from 'vitest'
import { readSettingsCollapsed, writeSettingsCollapsed } from '../../src/app/sidebar-preference'

describe('settings sidebar preference', () => {
  it('reads and writes the collapsed state using the stable browser key', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    expect(readSettingsCollapsed(storage)).toBe(false)
    writeSettingsCollapsed(true, storage)
    expect(readSettingsCollapsed(storage)).toBe(true)
    writeSettingsCollapsed(false, storage)
    expect(readSettingsCollapsed(storage)).toBe(false)
  })

  it('falls back safely when preference storage is unavailable', () => {
    expect(readSettingsCollapsed({ getItem: () => { throw new Error('blocked') } })).toBe(false)
    expect(() => writeSettingsCollapsed(true, { setItem: () => { throw new Error('blocked') } })).not.toThrow()
  })
})

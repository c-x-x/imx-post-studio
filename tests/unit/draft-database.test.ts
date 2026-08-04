import { afterEach, describe, expect, it, vi } from 'vitest'

const { openDB } = vi.hoisted(() => ({ openDB: vi.fn() }))

vi.mock('idb', () => ({ openDB }))

import { getDraftDatabase } from '../../src/drafts/database'

afterEach(() => vi.restoreAllMocks())

describe('draft database opening', () => {
  it('retries a rejected IndexedDB opening attempt in the same page session', async () => {
    const database = { name: 'imx-post-studio' }
    openDB.mockRejectedValueOnce(new DOMException('transient test failure', 'InvalidStateError'))
    openDB.mockResolvedValueOnce(database)

    await expect(getDraftDatabase()).rejects.toThrow('transient test failure')
    await expect(getDraftDatabase()).resolves.toBe(database)
    expect(openDB).toHaveBeenCalledTimes(2)
  })
})

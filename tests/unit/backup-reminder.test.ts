import { describe, expect, it } from 'vitest'
import { shouldShowBackupReminder } from '../../src/drafts/backup-reminder'

describe('shouldShowBackupReminder', () => {
  it('records a first-use time without showing a seven-day warning immediately', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    const now = Date.parse('2026-08-04T00:00:00Z')

    expect(shouldShowBackupReminder(storage, now)).toBe(false)
    expect(shouldShowBackupReminder(storage, now + 6 * 24 * 60 * 60 * 1000)).toBe(false)
    expect(shouldShowBackupReminder(storage, now + 7 * 24 * 60 * 60 * 1000 + 1)).toBe(true)
  })
})

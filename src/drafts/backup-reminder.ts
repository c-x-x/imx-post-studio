import { FIRST_USE_KEY, LAST_PORTABLE_EXPORT_KEY } from './backup-keys'

export interface TimestampStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function readTimestamp(storage: TimestampStorage, key: string): number | undefined {
  const value = storage.getItem(key)
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export function shouldShowBackupReminder(storage: TimestampStorage, now = Date.now()): boolean {
  const firstUse = readTimestamp(storage, FIRST_USE_KEY)
  if (firstUse === undefined) {
    storage.setItem(FIRST_USE_KEY, new Date(now).toISOString())
    return false
  }
  const latestPortableExport = readTimestamp(storage, LAST_PORTABLE_EXPORT_KEY)
  const baseline = latestPortableExport !== undefined && latestPortableExport > firstUse ? latestPortableExport : firstUse
  return now - baseline > SEVEN_DAYS
}

const SETTINGS_COLLAPSED_KEY = 'imx-post-studio:settings-collapsed'

export function readSettingsCollapsed(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return storage.getItem(SETTINGS_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeSettingsCollapsed(
  collapsed: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(SETTINGS_COLLAPSED_KEY, String(collapsed))
  } catch {
    // The current in-memory UI state remains usable when storage is unavailable.
  }
}

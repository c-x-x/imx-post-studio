const ACTIONS_COLLAPSED_KEY = 'imx-post-studio:actions-collapsed'

export function readActionsCollapsed(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return storage.getItem(ACTIONS_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeActionsCollapsed(
  collapsed: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(ACTIONS_COLLAPSED_KEY, String(collapsed))
  } catch {
    // The in-memory workspace remains usable when storage is unavailable.
  }
}

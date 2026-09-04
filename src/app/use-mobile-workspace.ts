import { useSyncExternalStore } from 'react'

// Keep phones in source mode when rotated; desktop/tablet layouts stay intact.
// Keep this breakpoint in sync with the phone workspace rules in app.css.
const query = '(max-width: 720px), (max-width: 1023px) and (max-height: 520px) and (pointer: coarse)'
const snapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches
const subscribe = (notify: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

export function useMobileWorkspace() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

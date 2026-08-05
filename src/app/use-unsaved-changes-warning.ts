import { useEffect } from 'react'

export function useUnsavedChangesWarning(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = true
    }

    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [hasUnsavedChanges])
}

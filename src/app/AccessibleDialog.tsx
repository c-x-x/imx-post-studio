import { createContext, useContext, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

interface AccessibleDialogProps {
  title: string
  children: ReactNode
  onClose: () => void
  returnFocus?: () => HTMLElement | null
  className?: string
  closeOnEscape?: boolean
}

const DialogCloseContext = createContext<(() => void) | undefined>(undefined)

/** Use this for in-dialog Cancel controls so pointer and Escape closes share focus restoration. */
export function DialogClose({ children }: { children: (close: () => void) => ReactNode }) {
  const close = useContext(DialogCloseContext)
  if (!close) throw new Error('DialogClose 必须在 AccessibleDialog 中使用')
  return <>{children(close)}</>
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

export function AccessibleDialog({ title, children, onClose, returnFocus, className = 'confirm-dialog', closeOnEscape = true }: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()

  const close = () => {
    const target = returnFocus?.()
    onClose()
    target?.focus()
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const first = dialog ? focusableElements(dialog)[0] : undefined
    ;(first ?? dialog)?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (closeOnEscape && event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const elements = focusableElements(dialog)
    if (elements.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return <div className="modal-backdrop" role="presentation"><section ref={dialogRef} className={className} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}><h2 id={titleId}>{title}</h2><DialogCloseContext.Provider value={close}>{children}</DialogCloseContext.Provider></section></div>
}

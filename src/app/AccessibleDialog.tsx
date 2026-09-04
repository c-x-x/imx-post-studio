import { createContext, useContext, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface AccessibleDialogProps {
  title: string
  children: ReactNode
  onClose: () => void
  returnFocus?: () => HTMLElement | null
  className?: string
  closeOnEscape?: boolean
}

export interface DialogCloseOptions {
  restoreFocus?: boolean
}

type DialogCloseHandler = (options?: unknown) => void

const DialogCloseContext = createContext<DialogCloseHandler | undefined>(undefined)
let openDialogCount = 0
let appRootAriaHidden: string | null = null
let appRootWasInert = false

function lockDocumentScroll() {
  openDialogCount += 1
  document.documentElement.classList.add('dialog-open')
  document.body.classList.add('dialog-open')
  const appRoot = document.getElementById('root')
  if (openDialogCount === 1 && appRoot) {
    appRootAriaHidden = appRoot.getAttribute('aria-hidden')
    appRootWasInert = appRoot.inert
    appRoot.inert = true
    appRoot.setAttribute('aria-hidden', 'true')
  }

  return () => {
    openDialogCount = Math.max(0, openDialogCount - 1)
    if (openDialogCount > 0) return
    document.documentElement.classList.remove('dialog-open')
    document.body.classList.remove('dialog-open')
    if (appRoot) {
      appRoot.inert = appRootWasInert
      if (appRootAriaHidden === null) appRoot.removeAttribute('aria-hidden')
      else appRoot.setAttribute('aria-hidden', appRootAriaHidden)
    }
  }
}

/** Use this for in-dialog Cancel controls so pointer and Escape closes share focus restoration. */
export function DialogClose({ children }: { children: (close: DialogCloseHandler) => ReactNode }) {
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

  const close: DialogCloseHandler = (options) => {
    const target = returnFocus?.()
    onClose()
    if (!(typeof options === 'object' && options !== null && 'restoreFocus' in options && options.restoreFocus === false)) {
      // React removes the modal (and its inert background) after this handler.
      // Restore focus once that commit has completed, otherwise browsers reject
      // focusing a control that is still inside the inert application root.
      queueMicrotask(() => { if (target?.isConnected) target.focus() })
    }
  }

  useLayoutEffect(() => {
    const unlockDocumentScroll = lockDocumentScroll()
    const dialog = dialogRef.current
    const first = dialog ? focusableElements(dialog)[0] : undefined
    ;(first ?? dialog)?.focus()
    return unlockDocumentScroll
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Portals retain React ancestry: a nested dialog owns its keyboard events.
    if (event.target instanceof Element && event.target.closest('[role="dialog"]') !== event.currentTarget) return
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

  return createPortal(<div className="modal-backdrop" role="presentation"><section ref={dialogRef} className={className} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}><h2 id={titleId}>{title}</h2><DialogCloseContext.Provider value={close}>{children}</DialogCloseContext.Provider></section></div>, document.body)
}

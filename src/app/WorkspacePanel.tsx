import type { ReactNode } from 'react'
import { AccessibleDialog, DialogClose } from './AccessibleDialog'

export function WorkspacePanel({ mobile, open, title, busy, onClose, returnFocus, children }: {
  mobile: boolean
  open: boolean
  title: string
  busy: boolean
  onClose: () => void
  returnFocus: () => HTMLElement | null
  children: ReactNode
}) {
  if (!mobile) return children
  if (!open) return null
  return <AccessibleDialog title={title} className="confirm-dialog mobile-workspace-dialog" onClose={onClose} returnFocus={returnFocus} closeOnEscape={!busy}>
    {children}
    <div className="dialog-actions"><DialogClose>{(close) => <button type="button" disabled={busy} onClick={close}>返回写作</button>}</DialogClose></div>
  </AccessibleDialog>
}

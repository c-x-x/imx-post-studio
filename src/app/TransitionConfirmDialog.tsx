import { AccessibleDialog, DialogClose } from './AccessibleDialog'

interface TransitionConfirmDialogProps {
  busy: boolean
  error?: string
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
  returnFocus: () => HTMLElement | null
}

export function TransitionConfirmDialog({
  busy,
  error,
  onCancel,
  onDiscard,
  onSave,
  returnFocus,
}: TransitionConfirmDialogProps) {
  return <AccessibleDialog title="新建文章前是否保存？" onClose={onCancel} returnFocus={returnFocus} closeOnEscape={!busy}>
    <p>请选择如何处理当前文章，然后再创建一篇新文章。</p>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    <div className="dialog-actions">
      <DialogClose>{(close) => <button type="button" disabled={busy} onClick={() => close()}>取消</button>}</DialogClose>
      <button type="button" disabled={busy} onClick={onDiscard}>删除草稿并继续</button>
      <button type="button" disabled={busy} onClick={onSave}>保存草稿并新建</button>
    </div>
  </AccessibleDialog>
}

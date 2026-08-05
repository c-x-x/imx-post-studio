import { AccessibleDialog, DialogClose } from './AccessibleDialog'

export type ConfirmedIntent = 'home' | 'new'

interface TransitionConfirmDialogProps {
  intent: ConfirmedIntent
  busy: boolean
  error?: string
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
  returnFocus: () => HTMLElement | null
}

export function TransitionConfirmDialog({
  intent,
  busy,
  error,
  onCancel,
  onDiscard,
  onSave,
  returnFocus,
}: TransitionConfirmDialogProps) {
  const isNew = intent === 'new'
  const title = isNew ? '新建文章前是否保存？' : '返回首页前是否保存？'

  return <AccessibleDialog title={title} onClose={onCancel} returnFocus={returnFocus} closeOnEscape={!busy}>
    <p>{isNew ? '请选择如何处理当前文章，然后再创建一篇新文章。' : '请选择如何处理当前文章，然后再返回首页。'}</p>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    <div className="dialog-actions">
      <DialogClose>{(close) => <button type="button" disabled={busy} onClick={() => close()}>取消</button>}</DialogClose>
      <button type="button" disabled={busy} onClick={onDiscard}>不保存并继续</button>
      <button type="button" disabled={busy} onClick={onSave}>保存到草稿库并继续</button>
    </div>
  </AccessibleDialog>
}

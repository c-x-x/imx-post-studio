import { useId, useState, type FormEvent } from 'react'
import { AccessibleDialog, DialogClose } from '../app/AccessibleDialog'

interface LinkDialogProps {
  initialHref: string
  initialText: string
  onClose: () => void
  onApply: (href: string, text: string) => void
  onRemove: () => void
  returnFocus: () => HTMLElement | null
}

function validLink(value: string): boolean {
  if (!value || /[\s\\]/u.test(value) || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false
  if (/^(?:#|\/(?!\/)|\.{1,2}\/)/u.test(value)) return true
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return Boolean(url.hostname)
    return ['mailto:', 'tel:'].includes(url.protocol) && Boolean(url.pathname)
  } catch {
    return false
  }
}

export function LinkDialog({ initialHref, initialText, onClose, onApply, onRemove, returnFocus }: LinkDialogProps) {
  const [href, setHref] = useState(initialHref)
  const [text, setText] = useState(initialText)
  const [error, setError] = useState('')
  const errorId = useId()

  return <AccessibleDialog title={initialHref ? '编辑链接' : '插入链接'} className="confirm-dialog link-dialog" onClose={onClose} returnFocus={returnFocus}>
    <DialogClose>{(close) => {
      const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const address = href.trim()
        if (!validLink(address)) {
          setError('请输入有效地址，例如 https://example.com、mailto:邮箱 或 /站内路径。')
          return
        }
        onApply(address, text.trim() ? text : address)
        close({ restoreFocus: false })
      }
      return <form onSubmit={submit}>
        <div className="link-dialog-fields">
          <label><span>链接地址</span><input value={href} inputMode="url" placeholder="https://example.com" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => { setHref(event.target.value); setError('') }} /></label>
          <label><span>链接文字</span><input value={text} placeholder="不填写则使用链接地址" onChange={(event) => setText(event.target.value)} /></label>
        </div>
        {error ? <p id={errorId} className="field-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" onClick={() => close()}>取消</button>
          {initialHref ? <button type="button" onClick={() => { onRemove(); close({ restoreFocus: false }) }}>移除链接</button> : null}
          <button type="submit">{initialHref ? '保存链接' : '插入链接'}</button>
        </div>
      </form>
    }}</DialogClose>
  </AccessibleDialog>
}

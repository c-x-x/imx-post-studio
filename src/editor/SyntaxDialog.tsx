import { useId, useMemo, useState } from 'react'
import katex from 'katex'
import { AccessibleDialog, DialogClose } from '../app/AccessibleDialog'

export type SyntaxDialogKind = 'math-inline' | 'image'

export interface SyntaxDialogValue {
  primary: string
  secondary?: string
}

interface SyntaxDialogProps {
  kind: SyntaxDialogKind
  initial?: SyntaxDialogValue
  onClose: () => void
  onSubmit: (value: SyntaxDialogValue) => void
  returnFocus: () => HTMLElement | null
}

const titles: Record<SyntaxDialogKind, string> = {
  'math-inline': '插入行内公式',
  image: '编辑图片信息',
}

export function SyntaxDialog({ kind, initial, onClose, onSubmit, returnFocus }: SyntaxDialogProps) {
  const id = useId()
  const [primary, setPrimary] = useState(initial?.primary ?? '')
  const [secondary, setSecondary] = useState(initial?.secondary ?? '')
  const [error, setError] = useState('')
  const formulaPreview = useMemo(() => kind === 'math-inline' && primary.trim()
    ? katex.renderToString(primary, { displayMode: false, throwOnError: false, strict: 'warn', trust: false })
    : '', [kind, primary])

  const submit = () => {
    if (!primary.trim()) {
      setError(kind === 'image' ? '替代文字不能为空' : '内容不能为空')
      return
    }
    onSubmit({ primary: primary.trim(), secondary: secondary.trim() })
    onClose()
  }

  return <AccessibleDialog title={titles[kind]} className="confirm-dialog syntax-dialog" onClose={onClose} returnFocus={returnFocus}>
    <label htmlFor={`${id}-primary`}>{kind === 'image' ? '替代文字' : 'LaTeX'}
      <input id={`${id}-primary`} autoFocus value={primary} onChange={(event) => setPrimary(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit() } }} />
    </label>
    {kind === 'math-inline' ? <div className="inline-math-preview" aria-label="公式实时预览" aria-live="polite">
      {formulaPreview
        ? <span dangerouslySetInnerHTML={{ __html: formulaPreview }} />
        : <span className="markdown-block-empty">输入 LaTeX 后在此实时预览</span>}
    </div> : null}
    {kind === 'image' ? <label htmlFor={`${id}-secondary`}>图片标题（可选）<input id={`${id}-secondary`} value={secondary} onChange={(event) => setSecondary(event.target.value)} /></label> : null}
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    <div className="dialog-actions"><DialogClose>{(close) => <button type="button" onClick={close}>取消</button>}</DialogClose><button type="button" onClick={submit}>{kind === 'image' ? '保存' : '插入'}</button></div>
  </AccessibleDialog>
}

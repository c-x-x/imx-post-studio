import { useId, useState } from 'react'
import { AccessibleDialog, DialogClose } from '../app/AccessibleDialog'

export type SyntaxDialogKind = 'math-inline' | 'math-block' | 'footnote' | 'callout' | 'mermaid' | 'image'

export interface SyntaxDialogValue {
  primary: string
  secondary?: string
  calloutType?: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'
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
  'math-block': '插入公式块',
  footnote: '插入脚注',
  callout: '插入提示块',
  mermaid: '插入 Mermaid 图表',
  image: '编辑图片信息',
}

export function SyntaxDialog({ kind, initial, onClose, onSubmit, returnFocus }: SyntaxDialogProps) {
  const id = useId()
  const [primary, setPrimary] = useState(initial?.primary ?? '')
  const [secondary, setSecondary] = useState(initial?.secondary ?? '')
  const [calloutType, setCalloutType] = useState(initial?.calloutType ?? 'NOTE')
  const [error, setError] = useState('')

  const submit = () => {
    if (!primary.trim()) {
      setError(kind === 'image' ? '替代文字不能为空' : '内容不能为空')
      return
    }
    onSubmit({ primary: primary.trim(), secondary: secondary.trim(), calloutType })
    onClose()
  }

  return <AccessibleDialog title={titles[kind]} className="confirm-dialog syntax-dialog" onClose={onClose} returnFocus={returnFocus}>
    {kind === 'callout' ? <label htmlFor={`${id}-type`}>类型<select id={`${id}-type`} value={calloutType} onChange={(event) => setCalloutType(event.target.value as NonNullable<SyntaxDialogValue['calloutType']>)}>
      <option value="NOTE">说明</option><option value="TIP">技巧</option><option value="IMPORTANT">重要</option><option value="WARNING">警告</option><option value="CAUTION">注意</option>
    </select></label> : null}
    <label htmlFor={`${id}-primary`}>{kind === 'image' ? '替代文字' : kind === 'footnote' ? '脚注内容' : kind.startsWith('math') ? 'LaTeX' : kind === 'mermaid' ? 'Mermaid 源码' : '内容'}
      {kind === 'math-inline' || kind === 'image'
        ? <input id={`${id}-primary`} autoFocus value={primary} onChange={(event) => setPrimary(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit() } }} />
        : <textarea id={`${id}-primary`} autoFocus rows={kind === 'mermaid' ? 9 : 5} value={primary} onChange={(event) => setPrimary(event.target.value)} />}
    </label>
    {kind === 'image' ? <label htmlFor={`${id}-secondary`}>图片标题（可选）<input id={`${id}-secondary`} value={secondary} onChange={(event) => setSecondary(event.target.value)} /></label> : null}
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    <div className="dialog-actions"><DialogClose>{(close) => <button type="button" onClick={close}>取消</button>}</DialogClose><button type="button" onClick={submit}>{kind === 'image' ? '保存' : '插入'}</button></div>
  </AccessibleDialog>
}

import { AccessibleDialog, DialogClose } from '../app/AccessibleDialog'

export type CalloutKind = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'

interface CalloutDialogProps {
  onClose: () => void
  onInsert: (kind: CalloutKind) => void
  returnFocus: () => HTMLElement | null
}

const calloutOptions: Array<{ kind: CalloutKind; label: string; description: string }> = [
  { kind: 'NOTE', label: '提醒内容', description: '绿色，用于温和地提醒读者' },
  { kind: 'TIP', label: '建议内容', description: '橙色，用于提供建议或更好的做法' },
  { kind: 'IMPORTANT', label: '重要内容', description: '金色，用于强调必须关注的关键信息' },
  { kind: 'WARNING', label: '警告内容', description: '红色，用于说明风险、限制或可能的后果' },
  { kind: 'CAUTION', label: '注意内容', description: '蓝色，用于补充需要留意的细节' },
]

export function CalloutDialog({ onClose, onInsert, returnFocus }: CalloutDialogProps) {
  return <AccessibleDialog title="选择提示块" className="confirm-dialog callout-dialog" onClose={onClose} returnFocus={returnFocus}>
    <p className="callout-dialog-help">选择一种样式插入编辑区，随后可直接输入正文。</p>
    <DialogClose>{(close) => <>
      <div className="callout-dialog-options">
        {calloutOptions.map(({ kind, label, description }) => <button
          key={kind}
          type="button"
          className="callout-dialog-option"
          data-callout={kind.toLowerCase()}
          onClick={() => {
            close({ restoreFocus: false })
            onInsert(kind)
          }}
        >
          <span className="callout-dialog-option-label">{label}</span>
          <span className="callout-dialog-option-description">{description}</span>
        </button>)}
      </div>
      <div className="dialog-actions"><button type="button" onClick={() => close()}>取消</button></div>
    </>}</DialogClose>
  </AccessibleDialog>
}

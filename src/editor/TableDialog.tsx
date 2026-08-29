import { useState, type FormEvent } from 'react'
import { AccessibleDialog, DialogClose } from '../app/AccessibleDialog'
export interface MarkdownTableDimensions {
  columns: number
  dataRows: number
}

interface TableDialogProps {
  onClose: () => void
  onInsert: (dimensions: MarkdownTableDimensions) => void
  returnFocus: () => HTMLElement | null
}

function integerInRange(value: string, minimum: number, maximum: number): number | null {
  if (!/^\d+$/.test(value)) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null
}

export function TableDialog({ onClose, onInsert, returnFocus }: TableDialogProps) {
  const [columns, setColumns] = useState('3')
  const [dataRows, setDataRows] = useState('2')
  const validColumns = integerInRange(columns, 2, 8)
  const validRows = integerInRange(dataRows, 1, 20)

  return <AccessibleDialog
    title="插入表格"
    onClose={onClose}
    returnFocus={returnFocus}
    className="confirm-dialog table-dialog"
  >
    <DialogClose>{(close) => {
      const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (validColumns === null || validRows === null) return
        close({ restoreFocus: false })
        onInsert({ columns: validColumns, dataRows: validRows })
      }
      return <form onSubmit={submit}>
        <div className="table-dialog-fields">
          <label>
            <span>列数</span>
            <input
              type="number"
              min="2"
              max="8"
              step="1"
              value={columns}
              onChange={(event) => setColumns(event.target.value)}
            />
          </label>
          <label>
            <span>数据行数</span>
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={dataRows}
              onChange={(event) => setDataRows(event.target.value)}
            />
          </label>
        </div>
        <p className="table-dialog-help">表头不计入数据行数，可创建 2–8 列、1–20 条数据行。</p>
        <div className="dialog-actions">
          <button type="button" onClick={() => close()}>取消</button>
          <button type="submit" disabled={validColumns === null || validRows === null}>插入</button>
        </div>
      </form>
    }}</DialogClose>
  </AccessibleDialog>
}

import { Transaction } from '@codemirror/state'
import { EditorView, WidgetType } from '@codemirror/view'
import { isolateHistory, redo, undo } from '@codemirror/commands'
import {
  addTableColumn,
  addTableRow,
  deleteTableColumn,
  deleteTableRow,
  replaceTableCell,
  serializeMarkdownTable,
  type MarkdownTableModel,
  type TableCellPosition,
  type TableMutation,
} from './table-model'

interface TableBinding {
  widget: EditableTableWidget
  view: EditorView
  active: TableCellPosition
  composing: string | null
}

interface PreservedFocus {
  position: TableCellPosition
  start: number
  end: number
}

const bindings = new WeakMap<HTMLElement, TableBinding>()

type StructureAction = 'add-row' | 'delete-row' | 'add-column' | 'delete-column'

const structureControls: Array<{ action: StructureAction; label: string; text: string }> = [
  { action: 'add-row', label: '在当前行下方添加一行', text: '添加行' },
  { action: 'delete-row', label: '删除当前行', text: '删除行' },
  { action: 'add-column', label: '在当前列右侧添加一列', text: '添加列' },
  { action: 'delete-column', label: '删除当前列', text: '删除列' },
]

function cellKey({ row, column }: TableCellPosition): string {
  return `${row}:${column}`
}

function positionFromInput(input: HTMLInputElement): TableCellPosition {
  return {
    row: Number(input.dataset.row),
    column: Number(input.dataset.column),
  }
}

function inputAt(root: HTMLElement, position: TableCellPosition): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>(
    `input[data-row="${position.row}"][data-column="${position.column}"]`,
  )
}

function structureMutation(binding: TableBinding, action: StructureAction): TableMutation | null {
  switch (action) {
    case 'add-row': return addTableRow(binding.widget.table, binding.active)
    case 'delete-row': return deleteTableRow(binding.widget.table, binding.active)
    case 'add-column': return addTableColumn(binding.widget.table, binding.active)
    case 'delete-column': return deleteTableColumn(binding.widget.table, binding.active)
  }
}

function updateControlStates(root: HTMLElement) {
  const binding = bindings.get(root)
  if (!binding) return
  for (const button of root.querySelectorAll<HTMLButtonElement>('.cm-md-table-controls button')) {
    const action = button.dataset.action as StructureAction
    button.disabled = binding.widget.disabled || structureMutation(binding, action) === null
  }
}

function focusCell(view: EditorView, root: HTMLElement, position: TableCellPosition) {
  view.requestMeasure({
    read() {
      return inputAt(root, position)
    },
    write(input) {
      input?.focus()
      input?.select()
    },
  })
}

function applyStructure(root: HTMLElement, action: StructureAction) {
  const binding = bindings.get(root)
  if (!binding || binding.widget.disabled) return
  const mutation = structureMutation(binding, action)
  if (!mutation) return
  binding.view.dispatch({
    changes: {
      from: binding.widget.from,
      to: binding.widget.to,
      insert: serializeMarkdownTable(mutation.table),
    },
    annotations: [Transaction.userEvent.of('input'), isolateHistory.of('full')],
  })
  focusCell(binding.view, root, mutation.focus)
}

function createControls(root: HTMLElement): HTMLElement {
  const controls = document.createElement('div')
  controls.className = 'cm-md-table-controls'
  controls.setAttribute('role', 'toolbar')
  controls.setAttribute('aria-label', '表格结构')
  for (const { action, label, text } of structureControls) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.action = action
    button.setAttribute('aria-label', label)
    button.textContent = text
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => applyStructure(root, action))
    controls.append(button)
  }
  return controls
}

function commitCell(root: HTMLElement, input: HTMLInputElement) {
  const binding = bindings.get(root)
  if (!binding || binding.widget.disabled) return
  const position = positionFromInput(input)
  binding.active = position
  const next = replaceTableCell(binding.widget.table, position, input.value)
  binding.view.dispatch({
    changes: {
      from: binding.widget.from,
      to: binding.widget.to,
      insert: serializeMarkdownTable(next),
    },
    annotations: Transaction.userEvent.of('input.type'),
  })
}

function createCellInput(
  root: HTMLElement,
  position: TableCellPosition,
  value: string,
  disabled: boolean,
): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'cm-md-table-input'
  input.dataset.row = String(position.row)
  input.dataset.column = String(position.column)
  input.setAttribute('aria-label', `第 ${position.row + 1} 行第 ${position.column + 1} 列`)
  input.value = value
  input.readOnly = disabled
  input.addEventListener('focus', () => {
    const binding = bindings.get(root)
    if (binding) {
      binding.active = positionFromInput(input)
      updateControlStates(root)
    }
  })
  input.addEventListener('keydown', (event) => {
    const binding = bindings.get(root)
    if (!binding) return
    if (event.key === 'Tab') {
      event.preventDefault()
      const inputs = [...root.querySelectorAll<HTMLInputElement>('.cm-md-table-input')]
      const index = inputs.indexOf(input)
      const target = inputs[index + (event.shiftKey ? -1 : 1)]
      target?.focus()
      return
    }
    const key = event.key.toLowerCase()
    const modifier = event.ctrlKey || event.metaKey
    if (modifier && key === 'z') {
      event.preventDefault()
      ;(event.shiftKey ? redo : undo)(binding.view)
    } else if (event.ctrlKey && key === 'y') {
      event.preventDefault()
      redo(binding.view)
    }
  })
  input.addEventListener('compositionstart', () => {
    const binding = bindings.get(root)
    if (binding) binding.composing = cellKey(positionFromInput(input))
  })
  input.addEventListener('compositionend', () => {
    const binding = bindings.get(root)
    if (!binding) return
    binding.composing = null
    commitCell(root, input)
  })
  input.addEventListener('input', (event) => {
    const binding = bindings.get(root)
    if (!binding || binding.composing === cellKey(positionFromInput(input)) || (event as InputEvent).isComposing) return
    commitCell(root, input)
  })
  return input
}

function buildTable(root: HTMLElement, binding: TableBinding) {
  const scroll = document.createElement('div')
  scroll.className = 'cm-md-table-scroll'
  const table = document.createElement('table')
  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  binding.widget.table.header.forEach((value, column) => {
    const cell = document.createElement('th')
    cell.scope = 'col'
    cell.append(createCellInput(root, { row: 0, column }, value, binding.widget.disabled))
    headRow.append(cell)
  })
  head.append(headRow)

  const body = document.createElement('tbody')
  binding.widget.table.rows.forEach((values, rowIndex) => {
    const row = document.createElement('tr')
    values.forEach((value, column) => {
      const cell = document.createElement('td')
      cell.append(createCellInput(root, { row: rowIndex + 1, column }, value, binding.widget.disabled))
      row.append(cell)
    })
    body.append(row)
  })
  table.append(head, body)
  scroll.append(table)
  root.replaceChildren(createControls(root), scroll)
  updateControlStates(root)
}

function tableShapeMatches(root: HTMLElement, table: MarkdownTableModel): boolean {
  return root.querySelectorAll('thead th').length === table.header.length
    && root.querySelectorAll('tbody tr').length === table.rows.length
    && [...root.querySelectorAll('tbody tr')].every((row) => row.children.length === table.header.length)
}

function syncTable(root: HTMLElement, binding: TableBinding) {
  root.dataset.tableFrom = String(binding.widget.from)
  root.dataset.tableTo = String(binding.widget.to)
  if (!tableShapeMatches(root, binding.widget.table)) {
    buildTable(root, binding)
    return
  }
  const values = [binding.widget.table.header, ...binding.widget.table.rows]
  for (let row = 0; row < values.length; row += 1) {
    for (let column = 0; column < values[row].length; column += 1) {
      const input = inputAt(root, { row, column })
      if (!input) continue
      const composing = binding.composing === cellKey({ row, column })
      if (!composing) input.value = values[row][column]
      input.readOnly = binding.widget.disabled
    }
  }
  updateControlStates(root)
}

function preserveFocus(root: HTMLElement): PreservedFocus | null {
  const input = document.activeElement
  if (!(input instanceof HTMLInputElement) || !root.contains(input)) return null
  return {
    position: positionFromInput(input),
    start: input.selectionStart ?? 0,
    end: input.selectionEnd ?? input.selectionStart ?? 0,
  }
}

function restoreFocus(root: HTMLElement, focus: PreservedFocus | null) {
  if (!focus) return
  const input = inputAt(root, focus.position)
  if (!input) return
  input.focus()
  const length = input.value.length
  input.setSelectionRange(Math.min(focus.start, length), Math.min(focus.end, length))
}

export class EditableTableWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly table: MarkdownTableModel,
    readonly disabled: boolean,
  ) {
    super()
  }

  eq(other: EditableTableWidget) {
    return this.from === other.from
      && this.to === other.to
      && this.disabled === other.disabled
      && serializeMarkdownTable(this.table) === serializeMarkdownTable(other.table)
  }

  toDOM(view: EditorView) {
    const root = document.createElement('div')
    root.className = 'cm-md-table'
    const binding: TableBinding = {
      widget: this,
      view,
      active: { row: 0, column: 0 },
      composing: null,
    }
    bindings.set(root, binding)
    syncTable(root, binding)
    return root
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    const focus = preserveFocus(dom)
    const previous = bindings.get(dom)
    const binding: TableBinding = {
      widget: this,
      view,
      active: previous?.active ?? { row: 0, column: 0 },
      composing: previous?.composing ?? null,
    }
    bindings.set(dom, binding)
    syncTable(dom, binding)
    restoreFocus(dom, focus)
    return true
  }

  ignoreEvent() {
    return true
  }
}

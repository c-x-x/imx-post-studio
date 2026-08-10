export type TableAlignment = 'none' | 'left' | 'center' | 'right'

export interface TableCellPosition {
  row: number
  column: number
}

export interface MarkdownTableModel {
  header: string[]
  alignments: TableAlignment[]
  rows: string[][]
}

export interface TableMutation {
  table: MarkdownTableModel
  focus: TableCellPosition
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 1
}

function splitTableRow(line: string): string[] {
  const source = line.trim()
  const cells: string[] = []
  let cell = ''
  let escaped = false

  for (const character of source) {
    if (character === '|' && !escaped) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
    escaped = !escaped && character === '\\'
  }
  cells.push(cell.trim())

  if (source.startsWith('|')) cells.shift()
  if (source.endsWith('|') && !isEscaped(source, source.length - 1)) cells.pop()
  return cells
}

function decodeTableCell(value: string): string {
  let decoded = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character !== '\\') {
      decoded += character
      continue
    }
    let end = index
    while (value[end] === '\\') end += 1
    const count = end - index
    if (value[end] === '|' && count % 2 === 1) {
      decoded += '\\'.repeat((count - 1) / 2) + '|'
      index = end
    } else {
      decoded += '\\'.repeat(count)
      index = end - 1
    }
  }
  return decoded
}

function encodeTableCell(value: string): string {
  const normalized = value.replace(/\r?\n|\r/g, ' ').trim()
  let encoded = ''
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]
    if (character === '|') {
      encoded += '\\|'
      continue
    }
    if (character !== '\\') {
      encoded += character
      continue
    }
    let end = index
    while (normalized[end] === '\\') end += 1
    const count = end - index
    if (normalized[end] === '|') {
      encoded += '\\'.repeat((count * 2) + 1) + '|'
      index = end
    } else {
      encoded += '\\'.repeat(count)
      index = end - 1
    }
  }
  return encoded
}

function parseAlignment(value: string): TableAlignment | null {
  if (!/^:?-{3,}:?$/.test(value)) return null
  if (value.startsWith(':') && value.endsWith(':')) return 'center'
  if (value.startsWith(':')) return 'left'
  if (value.endsWith(':')) return 'right'
  return 'none'
}

function alignmentSource(alignment: TableAlignment): string {
  switch (alignment) {
    case 'left': return ':---'
    case 'center': return ':---:'
    case 'right': return '---:'
    case 'none': return '---'
  }
}

export function parseMarkdownTable(source: string): MarkdownTableModel | null {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  if (lines.length < 3) return null

  const header = splitTableRow(lines[0])
  const delimiter = splitTableRow(lines[1])
  const rows = lines.slice(2).map(splitTableRow)
  if (header.length < 2 || delimiter.length !== header.length || rows.some((row) => row.length !== header.length)) return null

  const alignments = delimiter.map(parseAlignment)
  if (alignments.some((alignment) => alignment === null)) return null

  return {
    header: header.map(decodeTableCell),
    alignments: alignments as TableAlignment[],
    rows: rows.map((row) => row.map(decodeTableCell)),
  }
}

export function serializeMarkdownTable(table: MarkdownTableModel): string {
  const row = (cells: string[]) => `| ${cells.map(encodeTableCell).join(' | ')} |`
  return [
    row(table.header),
    row(table.alignments.map(alignmentSource)),
    ...table.rows.map(row),
  ].join('\n')
}

export function replaceTableCell(
  table: MarkdownTableModel,
  position: TableCellPosition,
  value: string,
): MarkdownTableModel {
  if (position.column < 0 || position.column >= table.header.length) return table
  if (position.row === 0) {
    const header = [...table.header]
    header[position.column] = value
    return { ...table, header }
  }
  if (position.row < 1 || position.row > table.rows.length) return table
  const rows = table.rows.map((row) => [...row])
  rows[position.row - 1][position.column] = value
  return { ...table, rows }
}

function validPosition(table: MarkdownTableModel, position: TableCellPosition): boolean {
  return position.row >= 0
    && position.row <= table.rows.length
    && position.column >= 0
    && position.column < table.header.length
}

export function addTableRow(table: MarkdownTableModel, current: TableCellPosition): TableMutation | null {
  if (!validPosition(table, current) || table.rows.length >= 20) return null
  const rows = table.rows.map((row) => [...row])
  rows.splice(current.row, 0, Array.from({ length: table.header.length }, () => '内容'))
  return {
    table: { ...table, rows },
    focus: { row: current.row + 1, column: current.column },
  }
}

export function deleteTableRow(table: MarkdownTableModel, current: TableCellPosition): TableMutation | null {
  if (!validPosition(table, current) || current.row === 0 || table.rows.length <= 1) return null
  const rows = table.rows.map((row) => [...row])
  rows.splice(current.row - 1, 1)
  return {
    table: { ...table, rows },
    focus: { row: Math.min(current.row, rows.length), column: current.column },
  }
}

export function addTableColumn(table: MarkdownTableModel, current: TableCellPosition): TableMutation | null {
  if (!validPosition(table, current) || table.header.length >= 8) return null
  const column = current.column + 1
  const header = [...table.header]
  const alignments = [...table.alignments]
  const rows = table.rows.map((row) => [...row])
  header.splice(column, 0, `列 ${column + 1}`)
  alignments.splice(column, 0, 'none')
  for (const row of rows) row.splice(column, 0, '内容')
  return {
    table: { header, alignments, rows },
    focus: { row: current.row, column },
  }
}

export function deleteTableColumn(table: MarkdownTableModel, current: TableCellPosition): TableMutation | null {
  if (!validPosition(table, current) || table.header.length <= 2) return null
  const header = [...table.header]
  const alignments = [...table.alignments]
  const rows = table.rows.map((row) => [...row])
  header.splice(current.column, 1)
  alignments.splice(current.column, 1)
  for (const row of rows) row.splice(current.column, 1)
  return {
    table: { header, alignments, rows },
    focus: { row: current.row, column: Math.min(current.column, header.length - 1) },
  }
}

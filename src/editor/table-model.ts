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
  if (source.endsWith('|') && !source.endsWith('\\|')) cells.pop()
  return cells
}

function decodeTableCell(value: string): string {
  let decoded = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const next = value[index + 1]
    if (character === '\\' && (next === '\\' || next === '|')) {
      decoded += next
      index += 1
    } else {
      decoded += character
    }
  }
  return decoded
}

function encodeTableCell(value: string): string {
  return value
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .trim()
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

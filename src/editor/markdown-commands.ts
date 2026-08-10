export interface MarkdownSelection {
  from: number
  to: number
}

export interface MarkdownEdit {
  value: string
  selection: MarkdownSelection
}

export interface MarkdownImageInput {
  alt: string
  name: string
}

export interface MarkdownTableDimensions {
  columns: number
  dataRows: number
}

export interface MarkdownTableEdit extends MarkdownEdit {
  tableFrom: number
  tableTo: number
}

export type MarkdownCommand =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'heading' }
  | { type: 'list' }
  | { type: 'task' }
  | { type: 'quote' }
  | { type: 'code' }
  | { type: 'link' }
  | { type: 'image'; name: string; alt: string }

function clampSelection(value: string, selection: MarkdownSelection): MarkdownSelection {
  const from = Math.max(0, Math.min(value.length, selection.from))
  const to = Math.max(from, Math.min(value.length, selection.to))
  return { from, to }
}

function replaceSelection(value: string, selection: MarkdownSelection, replacement: string, selectedFrom: number, selectedTo: number): MarkdownEdit {
  return {
    value: `${value.slice(0, selection.from)}${replacement}${value.slice(selection.to)}`,
    selection: { from: selection.from + selectedFrom, to: selection.from + selectedTo },
  }
}

export function insertMarkdownImages(
  value: string,
  initialSelection: MarkdownSelection,
  images: MarkdownImageInput[],
): MarkdownEdit {
  const selection = clampSelection(value, initialSelection)
  if (images.length === 0) return { value, selection }

  const before = value.slice(0, selection.from).replace(/\n+$/g, '')
  const after = value.slice(selection.to).replace(/^\n+/g, '')
  const imageBlock = images.map(({ alt, name }) => `![${alt}](images/${name})`).join('\n\n')
  const prefix = before ? `${before}\n\n` : ''
  const suffix = after ? `\n\n${after}` : ''
  const cursor = prefix.length + imageBlock.length
  return {
    value: `${prefix}${imageBlock}${suffix}`,
    selection: { from: cursor, to: cursor },
  }
}

function validateTableDimensions({ columns, dataRows }: MarkdownTableDimensions) {
  if (!Number.isInteger(columns) || columns < 2 || columns > 8
    || !Number.isInteger(dataRows) || dataRows < 1 || dataRows > 20) {
    throw new RangeError('表格尺寸无效')
  }
}

export function createMarkdownTable(dimensions: MarkdownTableDimensions): string {
  validateTableDimensions(dimensions)
  const { columns, dataRows } = dimensions
  const row = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [
    row(Array.from({ length: columns }, (_, index) => `列 ${index + 1}`)),
    row(Array.from({ length: columns }, () => '---')),
    ...Array.from({ length: dataRows }, () => row(Array.from({ length: columns }, () => '内容'))),
  ].join('\n')
}

function blankLineBefore(value: string): string {
  if (!value || value.endsWith('\n\n')) return ''
  return value.endsWith('\n') ? '\n' : '\n\n'
}

function blankLineAfter(value: string): string {
  if (!value || value.startsWith('\n\n')) return ''
  return value.startsWith('\n') ? '\n' : '\n\n'
}

export function insertMarkdownTable(
  value: string,
  initialSelection: MarkdownSelection,
  dimensions: MarkdownTableDimensions,
): MarkdownTableEdit {
  const selection = clampSelection(value, initialSelection)
  const table = createMarkdownTable(dimensions)
  const before = value.slice(0, selection.to)
  const after = value.slice(selection.to)
  const prefix = `${before}${blankLineBefore(before)}`
  const suffix = `${blankLineAfter(after)}${after}`
  const tableFrom = prefix.length
  return {
    value: `${prefix}${table}${suffix}`,
    selection: { from: tableFrom + 2, to: tableFrom + 5 },
    tableFrom,
    tableTo: tableFrom + table.length,
  }
}

export function runMarkdownCommand(value: string, initialSelection: MarkdownSelection, command: MarkdownCommand): MarkdownEdit {
  const selection = clampSelection(value, initialSelection)
  const selected = value.slice(selection.from, selection.to)

  switch (command.type) {
    case 'bold':
      return replaceSelection(value, selection, `**${selected}**`, 2, 2 + selected.length)
    case 'italic':
      return replaceSelection(value, selection, `*${selected}*`, 1, 1 + selected.length)
    case 'heading':
      return replaceSelection(value, selection, `## ${selected}`, 3, 3 + selected.length)
    case 'list':
      return replaceSelection(value, selection, `- ${selected}`, 2, 2 + selected.length)
    case 'task':
      return replaceSelection(value, selection, `- [ ] ${selected}`, 6, 6 + selected.length)
    case 'quote':
      return replaceSelection(value, selection, `> ${selected}`, 2, 2 + selected.length)
    case 'code':
      return replaceSelection(value, selection, `\`\`\`\n${selected}\n\`\`\``, 4, 4 + selected.length)
    case 'link': {
      const prefix = `[${selected}](`
      return replaceSelection(value, selection, `${prefix}https://)`, prefix.length, prefix.length + 'https://'.length)
    }
    case 'image': {
      const prefix = '!['
      const replacement = `${prefix}${command.alt}](images/${command.name})`
      return replaceSelection(value, selection, replacement, prefix.length, prefix.length + command.alt.length)
    }
  }
}

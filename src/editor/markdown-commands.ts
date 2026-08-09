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

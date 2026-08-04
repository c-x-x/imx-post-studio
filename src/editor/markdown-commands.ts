export interface MarkdownSelection {
  from: number
  to: number
}

export interface MarkdownEdit {
  value: string
  selection: MarkdownSelection
}

export type MarkdownCommand =
  | { type: 'bold' }
  | { type: 'heading' }
  | { type: 'list' }
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

export function runMarkdownCommand(value: string, initialSelection: MarkdownSelection, command: MarkdownCommand): MarkdownEdit {
  const selection = clampSelection(value, initialSelection)
  const selected = value.slice(selection.from, selection.to)

  switch (command.type) {
    case 'bold':
      return replaceSelection(value, selection, `**${selected}**`, 2, 2 + selected.length)
    case 'heading':
      return replaceSelection(value, selection, `## ${selected}`, 3, 3 + selected.length)
    case 'list':
      return replaceSelection(value, selection, `- ${selected}`, 2, 2 + selected.length)
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

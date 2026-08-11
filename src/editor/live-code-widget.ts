import { Transaction } from '@codemirror/state'
import { redo, undo } from '@codemirror/commands'
import { EditorView, WidgetType } from '@codemirror/view'

export interface EditableCodeBlock {
  code: string
  codeFrom: number
  codeTo: number
  fenceLength: number
  language: string
  marker: '`' | '~'
}

interface CodeBinding {
  widget: EditableCodeBlockWidget
  view: EditorView
  composing: 'code' | 'language' | null
}

interface PreservedFocus {
  field: 'code' | 'language'
  start: number
  end: number
}

const bindings = new WeakMap<HTMLElement, CodeBinding>()

function languageValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_+-]/g, '')
}

function safeFence(marker: '`' | '~', minimum: number, code: string): string {
  let longest = minimum - 1
  const pattern = marker === '`' ? /`+/g : /~+/g
  for (const match of code.matchAll(pattern)) longest = Math.max(longest, match[0].length)
  return marker.repeat(Math.max(3, minimum, longest + 1))
}

function serializeCodeBlock(widget: EditableCodeBlockWidget, language: string, code: string): string {
  const fence = safeFence(widget.block.marker, widget.block.fenceLength, code)
  return `${fence}${language}\n${code}\n${fence}`
}

export function parseEditableCodeBlock(source: string, from: number): EditableCodeBlock | null {
  const firstBreak = source.indexOf('\n')
  if (firstBreak < 0) return null
  const opening = source.slice(0, firstBreak)
  const match = /^(?: {0,3})(`{3,}|~{3,})(.*)$/.exec(opening)
  if (!match) return null

  const marker = match[1][0] as '`' | '~'
  const lines = source.slice(firstBreak + 1).split('\n')
  const closingPattern = new RegExp(`^ {0,3}\\${marker}{${match[1].length},}[\\t ]*$`)
  const closed = lines.length > 0 && closingPattern.test(lines[lines.length - 1])
  const code = (closed ? lines.slice(0, -1) : lines).join('\n')
  const codeFrom = from + firstBreak + 1

  return {
    code,
    codeFrom,
    codeTo: codeFrom + code.length,
    fenceLength: match[1].length,
    language: languageValue(match[2].trim().split(/\s+/)[0] ?? ''),
    marker,
  }
}

function codeEditor(root: HTMLElement): HTMLTextAreaElement {
  const editor = root.querySelector<HTMLTextAreaElement>('.cm-md-code-editor')
  if (!editor) throw new Error('Code editor is unavailable')
  return editor
}

function languageEditor(root: HTMLElement): HTMLInputElement {
  const editor = root.querySelector<HTMLInputElement>('.cm-md-code-language-input')
  if (!editor) throw new Error('Code language editor is unavailable')
  return editor
}

function syncLineNumbers(root: HTMLElement, code: string) {
  const gutter = root.querySelector<HTMLElement>('.cm-md-code-line-numbers')
  if (!gutter) return
  const count = Math.max(1, code.split('\n').length)
  gutter.replaceChildren(...Array.from({ length: count }, (_, index) => {
    const line = document.createElement('span')
    line.textContent = String(index + 1)
    return line
  }))
}

function syncCodeBlock(root: HTMLElement, binding: CodeBinding) {
  const textarea = codeEditor(root)
  const language = languageEditor(root)
  if (binding.composing !== 'code' && textarea.value !== binding.widget.block.code) {
    textarea.value = binding.widget.block.code
  }
  if (binding.composing !== 'language' && language.value !== binding.widget.block.language) {
    language.value = binding.widget.block.language
  }
  textarea.readOnly = binding.widget.disabled
  textarea.rows = Math.max(1, textarea.value.split('\n').length)
  language.disabled = binding.widget.disabled
  language.size = Math.max(4, Math.min(12, language.value.length || 4))
  syncLineNumbers(root, textarea.value)
}

function commitCodeBlock(root: HTMLElement, userEvent = 'input.type') {
  const binding = bindings.get(root)
  if (!binding || binding.widget.disabled) return
  const code = codeEditor(root).value
  const language = languageValue(languageEditor(root).value)
  const insert = serializeCodeBlock(binding.widget, language, code)
  if (binding.view.state.doc.sliceString(binding.widget.from, binding.widget.to) === insert) return
  binding.view.dispatch({
    changes: { from: binding.widget.from, to: binding.widget.to, insert },
    annotations: Transaction.userEvent.of(userEvent),
  })
}

function continueWriting(root: HTMLElement) {
  const binding = bindings.get(root)
  if (!binding || binding.widget.disabled) return
  const insert = `${serializeCodeBlock(
    binding.widget,
    languageValue(languageEditor(root).value),
    codeEditor(root).value,
  )}\n\n`
  const anchor = binding.widget.from + insert.length
  binding.view.dispatch({
    changes: { from: binding.widget.from, to: binding.widget.to, insert },
    selection: { anchor },
    annotations: Transaction.userEvent.of('input'),
    scrollIntoView: true,
  })
  binding.view.focus()
}

function createCodeEditor(root: HTMLElement, disabled: boolean): HTMLElement {
  const body = document.createElement('div')
  body.className = 'cm-md-code-body'
  const gutter = document.createElement('div')
  gutter.className = 'cm-md-code-line-numbers'
  gutter.setAttribute('aria-hidden', 'true')

  const textarea = document.createElement('textarea')
  textarea.className = 'cm-md-code-editor'
  textarea.setAttribute('aria-label', '代码块内容')
  textarea.autocomplete = 'off'
  textarea.spellcheck = false
  textarea.wrap = 'off'
  textarea.readOnly = disabled
  textarea.addEventListener('compositionstart', () => {
    const binding = bindings.get(root)
    if (binding) binding.composing = 'code'
  })
  textarea.addEventListener('compositionend', () => {
    const binding = bindings.get(root)
    if (binding) binding.composing = null
    commitCodeBlock(root)
  })
  textarea.addEventListener('input', (event) => {
    const binding = bindings.get(root)
    textarea.rows = Math.max(1, textarea.value.split('\n').length)
    syncLineNumbers(root, textarea.value)
    if (!binding || binding.composing === 'code' || (event as InputEvent).isComposing) return
    commitCodeBlock(root)
  })
  textarea.addEventListener('keydown', (event) => {
    const binding = bindings.get(root)
    if (!binding) return
    const modifier = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (modifier && event.key === 'Enter') {
      event.preventDefault()
      continueWriting(root)
    } else if (modifier && key === 'z') {
      event.preventDefault()
      ;(event.shiftKey ? redo : undo)(binding.view)
    } else if (event.ctrlKey && key === 'y') {
      event.preventDefault()
      redo(binding.view)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      const start = textarea.selectionStart
      textarea.setRangeText('  ', start, textarea.selectionEnd, 'end')
      textarea.rows = Math.max(1, textarea.value.split('\n').length)
      syncLineNumbers(root, textarea.value)
      commitCodeBlock(root)
    }
  })

  body.append(gutter, textarea)
  return body
}

function createLanguageEditor(root: HTMLElement, disabled: boolean): HTMLElement {
  const footer = document.createElement('div')
  footer.className = 'cm-md-code-footer'
  const language = document.createElement('input')
  language.type = 'text'
  language.className = 'cm-md-code-language-input'
  language.placeholder = '语言'
  language.disabled = disabled
  language.setAttribute('aria-label', '代码块语言')
  language.addEventListener('compositionstart', () => {
    const binding = bindings.get(root)
    if (binding) binding.composing = 'language'
  })
  language.addEventListener('compositionend', () => {
    const binding = bindings.get(root)
    if (binding) binding.composing = null
    commitCodeBlock(root)
  })
  language.addEventListener('input', (event) => {
    const binding = bindings.get(root)
    language.size = Math.max(4, Math.min(12, language.value.length || 4))
    if (!binding || binding.composing === 'language' || (event as InputEvent).isComposing) return
    commitCodeBlock(root)
  })
  language.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    codeEditor(root).focus()
  })
  footer.append(language)
  return footer
}

function preserveFocus(root: HTMLElement): PreservedFocus | null {
  const active = document.activeElement
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) || !root.contains(active)) return null
  return {
    field: active instanceof HTMLTextAreaElement ? 'code' : 'language',
    start: active.selectionStart ?? 0,
    end: active.selectionEnd ?? active.selectionStart ?? 0,
  }
}

function restoreFocus(root: HTMLElement, focus: PreservedFocus | null) {
  if (!focus) return
  const input = focus.field === 'code' ? codeEditor(root) : languageEditor(root)
  input.focus()
  const length = input.value.length
  input.setSelectionRange(Math.min(focus.start, length), Math.min(focus.end, length))
}

export class EditableCodeBlockWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly block: EditableCodeBlock,
    readonly disabled: boolean,
  ) {
    super()
  }

  eq(other: EditableCodeBlockWidget) {
    return this.from === other.from
      && this.to === other.to
      && this.disabled === other.disabled
      && this.block.language === other.block.language
      && this.block.code === other.block.code
      && this.block.marker === other.block.marker
      && this.block.fenceLength === other.block.fenceLength
  }

  toDOM(view: EditorView) {
    const root = document.createElement('div')
    root.className = 'cm-md-code-block'
    const binding: CodeBinding = { widget: this, view, composing: null }
    bindings.set(root, binding)
    root.append(createCodeEditor(root, this.disabled), createLanguageEditor(root, this.disabled))
    syncCodeBlock(root, binding)

    const selection = view.state.selection.main
    if (selection.empty && selection.from >= this.block.codeFrom && selection.from <= this.block.codeTo) {
      const offset = Math.max(0, Math.min(this.block.code.length, selection.from - this.block.codeFrom))
      view.requestMeasure({
        read: () => codeEditor(root),
        write(textarea) {
          textarea.focus()
          textarea.setSelectionRange(offset, offset)
        },
      })
    }
    return root
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    const focus = preserveFocus(dom)
    const previous = bindings.get(dom)
    const binding: CodeBinding = { widget: this, view, composing: previous?.composing ?? null }
    bindings.set(dom, binding)
    syncCodeBlock(dom, binding)
    restoreFocus(dom, focus)
    return true
  }

  destroy(dom: HTMLElement) {
    bindings.delete(dom)
  }

  ignoreEvent() {
    return true
  }
}

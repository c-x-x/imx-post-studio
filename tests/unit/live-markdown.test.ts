import { EditorState, Transaction } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { history } from '@codemirror/commands'
import { GFM } from '@lezer/markdown'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { liveMarkdown, type LiveMarkdownImage } from '../../src/editor/live-markdown'

const views: EditorView[] = []

function createView(
  doc: string,
  selection: number,
  mode: 'rich' | 'source' = 'rich',
  images = new Map<string, LiveMarkdownImage>(),
  disabled = false,
) {
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: selection },
      extensions: [history(), markdown({ extensions: GFM }), liveMarkdown({ mode, images, disabled })],
    }),
  })
  views.push(view)
  return view
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove()
    view.destroy()
  }
})

describe('liveMarkdown', () => {
  const documentText = [
    '# 标题',
    '',
    '普通 **粗体**、*斜体*、~~删除线~~、`代码` 和 [链接](https://example.com)。',
    '',
    '> 引用',
  ].join('\n')

  test('formats inactive blocks and reveals the complete active block source', () => {
    const paragraph = documentText.indexOf('普通')
    const view = createView(documentText, documentText.indexOf('引用'))

    expect(view.dom.querySelector('.cm-md-heading-1')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-strong')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-emphasis')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-strikethrough')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-inline-code')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-link')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-quote')).toBeTruthy()
    expect(view.dom.querySelectorAll('.cm-md-hidden').length).toBeGreaterThan(0)

    view.dispatch({ selection: { anchor: paragraph + 8 } })

    expect(view.dom.querySelector('.cm-md-strong .cm-md-hidden')).toBeNull()
    expect(view.dom.querySelector('.cm-md-emphasis .cm-md-hidden')).toBeNull()
    expect(view.dom.querySelector('.cm-md-link .cm-md-hidden')).toBeNull()
  })

  test('hides heading markers with their separator while revealing the active heading source', () => {
    const doc = [
      '# 一级',
      '## 二级',
      '### 三级',
      '#### 四级',
      '##### 五级',
      '###### 六级',
      '普通正文',
    ].join('\n')
    const view = createView(doc, doc.indexOf('普通正文'))

    for (let depth = 1; depth <= 6; depth += 1) {
      expect(view.dom.querySelector(`.cm-md-heading-${depth} .cm-md-hidden`)?.textContent)
        .toBe(`${'#'.repeat(depth)} `)
    }

    view.dispatch({ selection: { anchor: doc.indexOf('三级') } })
    expect(view.dom.querySelector('.cm-md-heading-3 .cm-md-hidden')).toBeNull()
    expect(view.state.doc.toString()).toBe(doc)
  })

  test('keeps literal Markdown untouched in source mode', () => {
    const view = createView(documentText, 0, 'source')

    expect(view.contentDOM.textContent).toContain('**粗体**')
    expect(view.contentDOM.textContent).toContain('[链接](https://example.com)')
    expect(view.dom.querySelector('.cm-md-hidden')).toBeNull()
    expect(view.dom.querySelector('.cm-md-image')).toBeNull()
  })

  test('keeps content and decorations valid during an IME composition transaction', () => {
    const view = createView(documentText, documentText.indexOf('引用'))
    const insertAt = documentText.indexOf('普通') + 2

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '拼' }))
    view.dispatch({
      changes: { from: insertAt, insert: '拼' },
      annotations: Transaction.userEvent.of('input.type.compose'),
    })

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '拼' }))
    expect(view.state.doc.toString()).toBe(`${documentText.slice(0, insertAt)}拼${documentText.slice(insertAt)}`)
    expect(view.dom.querySelector('.cm-md-heading-1')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-strong')).toBeTruthy()
  })

  test('renders only resolved local images as safe DOM widgets', () => {
    const doc = ['光标在这里', '', '![图](images/a.png)', '', '![远程](https://example.com/a.png)'].join('\n')
    const images = new Map<string, LiveMarkdownImage>([
      ['a.png', { alt: '图', name: 'a.png', url: 'blob:local-image' }],
    ])
    const view = createView(doc, 0, 'rich', images)

    const image = view.dom.querySelector<HTMLImageElement>('.cm-md-image img')
    expect(image?.src).toBe('blob:local-image')
    expect(image?.alt).toBe('图')
    expect(view.contentDOM.textContent).toContain('![远程](https://example.com/a.png)')
  })

  test('formats lists, fenced code, and horizontal rules outside the active block', () => {
    const doc = ['当前段落', '', '- 列表', '', '```ts', 'const answer = 42', '```', '', '---'].join('\n')
    const view = createView(doc, 0)

    expect(view.dom.querySelector('.cm-md-list')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-fenced-code')).toBeTruthy()
    expect(view.dom.querySelector('.cm-md-horizontal-rule')).toBeTruthy()
  })

  test.each([
    ['java', 4],
    ['typescript', 10],
    ['extraordinarylanguage', 12],
  ])('sizes the fenced code language input for %s', (languageName, expectedSize) => {
    const view = createView(['```' + languageName, 'git add .', '```'].join('\n'), 0)
    const language = view.dom.querySelector<HTMLInputElement>('[aria-label="代码块语言"]')

    expect(language?.value).toBe(languageName)
    expect(language?.size).toBe(expectedSize)
  })

  test('renders GFM tasks as checkboxes and writes exact marker changes', () => {
    const view = createView('- [ ] 未完成\n- [x] 已完成', 0)
    const checkboxes = [...view.dom.querySelectorAll<HTMLInputElement>('.cm-md-task-checkbox')]

    expect(checkboxes).toHaveLength(2)
    expect(checkboxes.map((checkbox) => checkbox.checked)).toEqual([false, true])

    checkboxes[0].click()
    expect(view.state.doc.toString()).toBe('- [x] 未完成\n- [x] 已完成')

    view.dom.querySelector<HTMLInputElement>('.cm-md-task-checkbox')?.click()
    expect(view.state.doc.toString()).toBe('- [ ] 未完成\n- [x] 已完成')
  })

  test('keeps task markers literal in source mode', () => {
    const view = createView('- [ ] 未完成', 0, 'source')

    expect(view.dom.querySelector('.cm-md-task-checkbox')).toBeNull()
    expect(view.contentDOM.textContent).toContain('[ ]')
  })

  test('disables task checkboxes when editing is disabled', () => {
    const view = createView('- [ ] 未完成', 0, 'rich', new Map(), true)
    const checkbox = view.dom.querySelector<HTMLInputElement>('.cm-md-task-checkbox')

    expect(checkbox).not.toBeNull()
    expect(checkbox).toBeDisabled()
    checkbox?.click()
    expect(view.state.doc.toString()).toBe('- [ ] 未完成')
  })

  test('renders a complete GFM table as editable semantic controls', () => {
    const source = '| 名称 | 值 |\n| --- | --- |\n| 格式 | WebP |'
    const view = createView(`正文\n\n${source}`, 0)
    const table = view.dom.querySelector<HTMLDivElement>('.cm-md-table')

    expect(table).not.toBeNull()
    expect(table?.querySelectorAll('thead th')).toHaveLength(2)
    expect(table?.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(table?.querySelector<HTMLInputElement>('input[data-row="0"][data-column="0"]')).toHaveValue('名称')
    expect(table?.querySelector<HTMLInputElement>('input[data-row="1"][data-column="1"]')).toHaveAccessibleName('第 2 行第 2 列')
    expect(view.dom.querySelector('.cm-md-table-separator')).not.toBeNull()
    expect(table?.querySelector<HTMLButtonElement>('button[data-action="continue-writing"]')).toHaveTextContent('下方写作')
    expect(table?.querySelector<HTMLButtonElement>('button[data-action="delete-table"]')).toHaveTextContent('删除表格')
  })

  test('continues below and deletes a table without breaking surrounding Markdown', () => {
    const source = '正文\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n后文'
    const view = createView(source, 0)
    const table = view.dom.querySelector<HTMLDivElement>('.cm-md-table')!

    table.querySelector<HTMLButtonElement>('button[data-action="continue-writing"]')!.click()
    expect(view.state.selection.main.from).toBe(source.indexOf('\n\n后文') + 2)

    table.querySelector<HTMLButtonElement>('button[data-action="delete-table"]')!.click()
    expect(view.state.doc.toString()).toBe('正文\n\n后文')
    expect(view.dom.querySelector('.cm-md-table')).toBeNull()
  })

  test('writes escaped cell Markdown while reusing DOM and preserving the caret', () => {
    const source = '| 名称 | 值 |\n| --- | --- |\n| 格式 | WebP |'
    const view = createView(`正文\n\n${source}`, 0)
    const table = view.dom.querySelector<HTMLDivElement>('.cm-md-table')!
    const first = table.querySelector<HTMLInputElement>('input[data-row="0"][data-column="0"]')!

    first.focus()
    first.value = '名|称'
    first.setSelectionRange(1, 1)
    first.dispatchEvent(new InputEvent('input', { bubbles: true, data: '|' }))

    expect(view.state.doc.toString()).toContain('| 名\\|称 | 值 |')
    expect(view.dom.querySelector('.cm-md-table')).toBe(table)
    expect(document.activeElement).toBe(first)
    expect(first.selectionStart).toBe(1)
    expect(first.selectionEnd).toBe(1)
  })

  test('commits a composed cell value once when a trailing input follows compositionend', () => {
    const source = '| 名称 | 值 |\n| --- | --- |\n| 格式 | WebP |'
    const view = createView(source, 0)
    const first = view.dom.querySelector<HTMLInputElement>('.cm-md-table input[data-row="0"][data-column="0"]')!
    const before = view.state.doc.toString()
    const dispatch = vi.spyOn(view, 'dispatch')

    first.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    first.value = '拼'
    first.dispatchEvent(new InputEvent('input', { bubbles: true, data: '拼', isComposing: true }))
    expect(view.state.doc.toString()).toBe(before)

    first.value = '拼音'
    first.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '拼音' }))
    first.dispatchEvent(new InputEvent('input', { bubbles: true, data: '拼音', isComposing: false }))
    expect(view.state.doc.toString()).toContain('| 拼音 | 值 |')
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  test('commits the next changed input when no trailing composition input arrives', () => {
    const source = '| 名称 | 值 |\n| --- | --- |\n| 格式 | WebP |'
    const view = createView(source, 0)
    const first = view.dom.querySelector<HTMLInputElement>('.cm-md-table input[data-row="0"][data-column="0"]')!
    const dispatch = vi.spyOn(view, 'dispatch')

    first.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    first.value = '拼音'
    first.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '拼音' }))
    first.value = '拼音法'
    first.dispatchEvent(new InputEvent('input', { bubbles: true, data: '法', isComposing: false }))

    expect(view.state.doc.toString()).toContain('| 拼音法 | 值 |')
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  test('keeps unsupported and source-mode tables literal', () => {
    const valid = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const invalid = '| A | B |\n| --- | --- |\n| only one |'
    const sourceView = createView(valid, 0, 'source')
    const invalidView = createView(invalid, 0)

    expect(sourceView.dom.querySelector('.cm-md-table')).toBeNull()
    expect(sourceView.contentDOM.textContent).toContain('| A | B |')
    expect(invalidView.dom.querySelector('.cm-md-table')).toBeNull()
    expect(invalidView.contentDOM.textContent).toContain('only one')
  })

  test('makes table inputs read-only when editing is disabled', () => {
    const source = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const view = createView(source, 0, 'rich', new Map(), true)

    const inputs = [...view.dom.querySelectorAll<HTMLInputElement>('.cm-md-table input')]
    expect(inputs).toHaveLength(4)
    expect(inputs.every((input) => input.readOnly)).toBe(true)
  })

  test('moves between cells with Tab and exits below the table at the boundary', () => {
    const source = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const view = createView(source, 0)
    const inputs = [...view.dom.querySelectorAll<HTMLInputElement>('.cm-md-table input')]

    inputs[0].focus()
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(inputs[1])

    inputs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(inputs[0])

    inputs[3].focus()
    inputs[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(view.state.doc.toString()).toBe(`${source}\n\n`)
    expect(view.state.selection.main.from).toBe(view.state.doc.length)
  })

  test('delegates cell undo and redo shortcuts to CodeMirror history', () => {
    const source = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const view = createView(source, 0)
    const first = view.dom.querySelector<HTMLInputElement>('.cm-md-table input')!
    first.focus()
    first.value = '修改后'
    first.dispatchEvent(new InputEvent('input', { bubbles: true, data: '修改后' }))
    expect(view.state.doc.toString()).toContain('| 修改后 | B |')

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))
    expect(view.state.doc.toString()).toBe(source)

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    expect(view.state.doc.toString()).toContain('| 修改后 | B |')

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true }))
    expect(view.state.doc.toString()).toContain('| 修改后 | B |')
  })

  test('adds rows and columns in one undoable transaction and moves focus', async () => {
    const source = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'
    const view = createView(source, 0)
    const firstData = view.dom.querySelector<HTMLInputElement>('input[data-row="1"][data-column="0"]')!
    firstData.focus()

    view.dom.querySelector<HTMLButtonElement>('button[aria-label="在当前行下方添加一行"]')!.click()
    expect(view.state.doc.toString()).toBe(
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 内容 | 内容 |\n| 3 | 4 |',
    )
    await vi.waitFor(() => expect(document.activeElement).toHaveAccessibleName('第 3 行第 1 列'))

    const active = document.activeElement as HTMLInputElement
    view.dom.querySelector<HTMLButtonElement>('button[aria-label="在当前列右侧添加一列"]')!.click()
    expect(view.state.doc.toString()).toBe(
      '| A | 列 2 | B |\n| --- | --- | --- |\n| 1 | 内容 | 2 |\n| 内容 | 内容 | 内容 |\n| 3 | 内容 | 4 |',
    )
    expect(active.isConnected).toBe(false)
    await vi.waitFor(() => expect(document.activeElement).toHaveAccessibleName('第 3 行第 2 列'))

    ;(document.activeElement as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
    }))
    expect(view.state.doc.toString()).toBe(
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 内容 | 内容 |\n| 3 | 4 |',
    )
  })

  test('deletes only eligible rows and columns and focuses the nearest cell', async () => {
    const source = '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |'
    const view = createView(source, 0)
    const last = view.dom.querySelector<HTMLInputElement>('input[data-row="2"][data-column="2"]')!
    last.focus()

    view.dom.querySelector<HTMLButtonElement>('button[aria-label="删除当前行"]')!.click()
    expect(view.state.doc.toString()).toBe('| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |')
    await vi.waitFor(() => expect(document.activeElement).toHaveAccessibleName('第 2 行第 3 列'))

    view.dom.querySelector<HTMLButtonElement>('button[aria-label="删除当前列"]')!.click()
    expect(view.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
    await vi.waitFor(() => expect(document.activeElement).toHaveAccessibleName('第 2 行第 2 列'))

    expect(view.dom.querySelector<HTMLButtonElement>('button[aria-label="删除当前行"]')).toBeDisabled()
    expect(view.dom.querySelector<HTMLButtonElement>('button[aria-label="删除当前列"]')).toBeDisabled()
  })

  test('disables structural controls at upper limits and when editing is disabled', () => {
    const maxColumns = Array.from({ length: 8 }, (_, index) => `C${index + 1}`)
    const row = (cells: string[]) => `| ${cells.join(' | ')} |`
    const maxSource = [
      row(maxColumns),
      row(Array.from({ length: 8 }, () => '---')),
      ...Array.from({ length: 20 }, () => row(Array.from({ length: 8 }, () => '内容'))),
    ].join('\n')
    const maxView = createView(maxSource, 0)
    const disabledView = createView('| A | B |\n| --- | --- |\n| 1 | 2 |', 0, 'rich', new Map(), true)

    expect(maxView.dom.querySelector<HTMLButtonElement>('button[aria-label="在当前行下方添加一行"]')).toBeDisabled()
    expect(maxView.dom.querySelector<HTMLButtonElement>('button[aria-label="在当前列右侧添加一列"]')).toBeDisabled()
    expect([...disabledView.dom.querySelectorAll<HTMLButtonElement>('.cm-md-table-controls button')].every((button) => button.disabled)).toBe(true)
  })
})

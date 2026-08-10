# WYSIWYG Markdown Table Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a “表格” toolbar action that inserts configurable GFM tables and lets users edit cells and table structure directly in instant-formatting mode while Markdown remains the only source of truth.

**Architecture:** Keep table creation and mutation in DOM-free pure functions, then let the existing Lezer GFM syntax tree identify complete tables. A focused CodeMirror block widget renders those tables, writes every edit back through one CodeMirror transaction, and reuses its DOM so focus, IME composition, caret position, undo, autosave, export, and preview continue through existing application paths.

**Tech Stack:** React 19, TypeScript 6, CodeMirror 6, Lezer Markdown GFM, Vitest, Testing Library, Playwright.

## Global Constraints

- Modify only `imx-post-studio`; do not modify or import `hugo-theme-imx`.
- Do not add a rich-text editor or table dependency.
- Markdown is the only authoritative article body; the table DOM never owns a second article state.
- Source mode always shows literal GFM Markdown.
- Only complete tables with exactly matching header, delimiter, and data-row column counts become widgets; unsupported or incomplete tables remain literal Markdown.
- Creation limits are 2–8 columns and 1–20 data rows; structural controls preserve the same limits.
- The header cannot be deleted, at least one data row and two columns must remain, and merged cells are unsupported.
- Cell edits are single-line; literal `|` is stored as `\|` and displayed as `|`.
- IME composition writes to Markdown once on `compositionend`, not once per candidate update.
- Table edits and structural actions must use CodeMirror transactions so the existing `onChange`, autosave, dirty-state, draft, export, and preview paths remain unchanged.
- Reuse `AccessibleDialog`, existing Studio tokens, and the current CodeMirror instance; do not remount the editor or reset history.

---

### Task 1: Pure GFM Table Model and Serialization

**Files:**
- Create: `src/editor/table-model.ts`
- Create: `tests/unit/table-model.test.ts`

**Interfaces:**
- Produces:

```ts
export type TableAlignment = 'none' | 'left' | 'center' | 'right'

export interface TableCellPosition {
  row: number // 0 is the header; 1..n are data rows
  column: number
}

export interface MarkdownTableModel {
  header: string[]
  alignments: TableAlignment[]
  rows: string[][]
}

export function parseMarkdownTable(source: string): MarkdownTableModel | null
export function serializeMarkdownTable(table: MarkdownTableModel): string
export function replaceTableCell(
  table: MarkdownTableModel,
  position: TableCellPosition,
  value: string,
): MarkdownTableModel
```

- Cell strings in `MarkdownTableModel` are display values: escaped pipes are decoded and delimiter syntax is stored separately as `alignments`.

- [ ] **Step 1: Write failing parse and serialization tests**

```ts
import { describe, expect, test } from 'vitest'
import {
  parseMarkdownTable,
  replaceTableCell,
  serializeMarkdownTable,
} from '../../src/editor/table-model'

describe('Markdown table model', () => {
  test('parses aligned GFM cells and decodes escaped pipes', () => {
    expect(parseMarkdownTable([
      '| 名称 | 说明 | 数量 |',
      '| :--- | :---: | ---: |',
      '| A\\|B | 内容 | 2 |',
    ].join('\n'))).toEqual({
      header: ['名称', '说明', '数量'],
      alignments: ['left', 'center', 'right'],
      rows: [['A|B', '内容', '2']],
    })
  })

  test.each([
    '| A | B |\n| --- | --- |\n| only one |',
    '| A | B |\n| --- |\n| 1 | 2 |',
    '| A |\n| --- |\n| 1 |',
  ])('rejects a table that cannot be edited losslessly: %s', (source) => {
    expect(parseMarkdownTable(source)).toBeNull()
  })

  test('serializes a cell edit with escaped pipes and no real newline', () => {
    const table = parseMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |')!
    const edited = replaceTableCell(table, { row: 1, column: 0 }, '甲|乙\n丙')

    expect(serializeMarkdownTable(edited)).toBe(
      '| A | B |\n| --- | --- |\n| 甲\\|乙 丙 | 2 |',
    )
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/unit/table-model.test.ts`

Expected: FAIL because `src/editor/table-model.ts` does not exist.

- [ ] **Step 3: Implement strict row splitting and model conversion**

Implement a row splitter that treats only unescaped pipes as delimiters, accepts optional outer pipes, trims cell padding, and refuses unequal column counts. Decode only `\|` for display. Parse delimiter cells with these exact rules:

```ts
function parseAlignment(value: string): TableAlignment | null {
  if (!/^:?-{3,}:?$/.test(value)) return null
  if (value.startsWith(':') && value.endsWith(':')) return 'center'
  if (value.startsWith(':')) return 'left'
  if (value.endsWith(':')) return 'right'
  return 'none'
}
```

Serialize every row as `| ${cells.join(' | ')} |`. Convert newlines in edited cells to spaces and escape every literal pipe before serialization. Clone arrays in `replaceTableCell`; never mutate the input model.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/unit/table-model.test.ts`

Expected: PASS for alignment, escaped pipes, strict dimensions, immutable cell edits, and exact GFM output.

- [ ] **Step 5: Commit**

```bash
git add src/editor/table-model.ts tests/unit/table-model.test.ts
git commit -m "feat: add pure Markdown table model"
```

### Task 2: Pure Row and Column Operations

**Files:**
- Modify: `src/editor/table-model.ts`
- Modify: `tests/unit/table-model.test.ts`

**Interfaces:**
- Consumes: `MarkdownTableModel` and `TableCellPosition` from Task 1.
- Produces:

```ts
export interface TableMutation {
  table: MarkdownTableModel
  focus: TableCellPosition
}

export function addTableRow(table: MarkdownTableModel, current: TableCellPosition): TableMutation | null
export function deleteTableRow(table: MarkdownTableModel, current: TableCellPosition): TableMutation | null
export function addTableColumn(table: MarkdownTableModel, current: TableCellPosition): TableMutation | null
export function deleteTableColumn(table: MarkdownTableModel, current: TableCellPosition): TableMutation | null
```

- [ ] **Step 1: Write failing immutable structure tests**

```ts
test('adds a data row below the active row and after the header', () => {
  const table = parseMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |')!
  expect(addTableRow(table, { row: 0, column: 1 })).toEqual({
    table: {
      ...table,
      rows: [['内容', '内容'], ['1', '2']],
    },
    focus: { row: 1, column: 1 },
  })
})

test('adds and deletes a column while preserving alignment and nearest focus', () => {
  const table = parseMarkdownTable('| A | B |\n| :--- | ---: |\n| 1 | 2 |')!
  const added = addTableColumn(table, { row: 1, column: 0 })!
  expect(added.table).toEqual({
    header: ['A', '列 2', 'B'],
    alignments: ['left', 'none', 'right'],
    rows: [['1', '内容', '2']],
  })
  expect(deleteTableColumn(added.table, added.focus)?.focus).toEqual({ row: 1, column: 1 })
})

test('enforces header, row, column, and upper limits', () => {
  const minimum = parseMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |')!
  expect(deleteTableRow(minimum, { row: 0, column: 0 })).toBeNull()
  expect(deleteTableRow(minimum, { row: 1, column: 0 })).toBeNull()
  expect(deleteTableColumn(minimum, { row: 1, column: 0 })).toBeNull()

  const maxRows = { ...minimum, rows: Array.from({ length: 20 }, () => ['内容', '内容']) }
  const maxColumns = {
    header: Array.from({ length: 8 }, (_, index) => `列 ${index + 1}`),
    alignments: Array.from({ length: 8 }, () => 'none' as const),
    rows: [Array.from({ length: 8 }, () => '内容')],
  }
  expect(addTableRow(maxRows, { row: 1, column: 0 })).toBeNull()
  expect(addTableColumn(maxColumns, { row: 1, column: 0 })).toBeNull()
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/unit/table-model.test.ts`

Expected: FAIL because the four structural functions do not exist.

- [ ] **Step 3: Implement bounded immutable mutations**

Use logical row `0` for the header. For `addTableRow`, insert a `内容` row at data-array index `current.row`; therefore a header target inserts the first data row and a data-row target inserts immediately below it. Reject deletion for the header or when only one data row remains. Add a column immediately to the right, naming its header `列 ${newColumn + 1}`, with `none` alignment and `内容` data cells. Clamp returned focus to the closest surviving cell after deletion.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/unit/table-model.test.ts`

Expected: PASS with no mutation of the source model and all limits enforced.

- [ ] **Step 5: Commit**

```bash
git add src/editor/table-model.ts tests/unit/table-model.test.ts
git commit -m "feat: add Markdown table structure operations"
```

### Task 3: Configurable Table Insertion Dialog

**Files:**
- Create: `src/editor/TableDialog.tsx`
- Modify: `src/editor/markdown-commands.ts`
- Modify: `src/editor/MarkdownEditor.tsx`
- Modify: `src/app/app.css`
- Modify: `tests/unit/markdown-commands.test.ts`
- Modify: `tests/components/MarkdownEditor.test.tsx`

**Interfaces:**
- Produces in `markdown-commands.ts`:

```ts
export interface MarkdownTableDimensions {
  columns: number
  dataRows: number
}

export interface MarkdownTableEdit extends MarkdownEdit {
  tableFrom: number
  tableTo: number
}

export function createMarkdownTable(dimensions: MarkdownTableDimensions): string
export function insertMarkdownTable(
  value: string,
  selection: MarkdownSelection,
  dimensions: MarkdownTableDimensions,
): MarkdownTableEdit
```

- Produces in `TableDialog.tsx`:

```ts
interface TableDialogProps {
  onClose: () => void
  onInsert: (dimensions: MarkdownTableDimensions) => void
  returnFocus: () => HTMLElement | null
}
```

- [ ] **Step 1: Write failing table creation and insertion tests**

```ts
expect(createMarkdownTable({ columns: 3, dataRows: 2 })).toBe([
  '| 列 1 | 列 2 | 列 3 |',
  '| --- | --- | --- |',
  '| 内容 | 内容 | 内容 |',
  '| 内容 | 内容 | 内容 |',
].join('\n'))

expect(insertMarkdownTable('前文后文', { from: 2, to: 2 }, { columns: 2, dataRows: 1 })).toEqual({
  value: '前文\n\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n\n后文',
  selection: { from: 6, to: 9 },
  tableFrom: 4,
  tableTo: 43,
})

const selected = insertMarkdownTable('保留这些字', { from: 2, to: 4 }, { columns: 2, dataRows: 1 })
expect(selected.value.startsWith('保留这些字\n\n| 列 1')).toBe(true)
```

- [ ] **Step 2: Run command tests and verify RED**

Run: `npm test -- tests/unit/markdown-commands.test.ts`

Expected: FAIL because the table functions do not exist.

- [ ] **Step 3: Implement exact block insertion**

Clamp dimensions only after validating they are integers in the public functions. Insert at `selection.to`, preserving selected text. Add only the missing newlines needed to leave one blank line before and after the table. Return the first header label range as `selection`, plus absolute `tableFrom` and `tableTo` offsets.

- [ ] **Step 4: Write failing dialog and toolbar tests**

```tsx
const tableButton = screen.getByRole('button', { name: '表格' })
fireEvent.click(tableButton)
const dialog = screen.getByRole('dialog', { name: '插入表格' })
expect(within(dialog).getByLabelText('列数')).toHaveValue(3)
expect(within(dialog).getByLabelText('数据行数')).toHaveValue(2)

fireEvent.change(within(dialog).getByLabelText('列数'), { target: { value: '8' } })
fireEvent.change(within(dialog).getByLabelText('数据行数'), { target: { value: '20' } })
fireEvent.click(within(dialog).getByRole('button', { name: '插入' }))
expect(view.state.doc.toString()).toContain('| 列 1 | 列 2 |')
expect(view.state.sliceDoc(
  view.state.selection.main.from,
  view.state.selection.main.to,
)).toBe('列 1')
```

Also assert Escape/cancel restores focus to “表格”, blank/out-of-range values disable “插入”, and a disabled editor has a disabled “表格” button that cannot open the dialog.

- [ ] **Step 5: Run component tests and verify RED**

Run: `npm test -- tests/components/MarkdownEditor.test.tsx`

Expected: FAIL because the toolbar button and dialog do not exist.

- [ ] **Step 6: Implement the accessible dialog and focus handoff**

Build `TableDialog` from `AccessibleDialog` and `DialogClose`. Keep input state as strings so blank values remain invalid; enable insertion only when both values are integers inside their limits. Use `type="number"`, `min`, `max`, and `step="1"`. On confirm, close with `{ restoreFocus: false }`, then call `onInsert`.

In `MarkdownEditor`, hold `tableDialogOpen`, a ref to the toolbar button, and an `insertTable` handler. Dispatch the returned complete document and selection once, call existing `onChange(edit.value)`, then use `view.requestMeasure` to focus and select:

```ts
const selector = `.cm-md-table[data-table-from="${edit.tableFrom}"] input[data-row="0"][data-column="0"]`
view.requestMeasure({
  write() {
    const input = view.dom.querySelector<HTMLInputElement>(selector)
    input?.focus()
    input?.select()
  },
})
```

The selector becomes active after Task 4; until then, the same dispatch must keep the CodeMirror selection on the first header text so Task 3 is independently usable and testable.

- [ ] **Step 7: Style the compact dialog and verify GREEN**

Add a `.table-dialog` variant no wider than 440px, a two-column `.table-dialog-fields` layout, and the existing mobile breakpoint that stacks fields below 480px. Use only `--imx-*` variables and existing `.dialog-actions` rules.

Run:

```bash
npm test -- tests/unit/markdown-commands.test.ts tests/components/MarkdownEditor.test.tsx
npm run typecheck
```

Expected: PASS for limits, focus restoration, insertion boundaries, disabled state, and first-header selection.

- [ ] **Step 8: Commit**

```bash
git add src/editor/TableDialog.tsx src/editor/markdown-commands.ts src/editor/MarkdownEditor.tsx src/app/app.css tests/unit/markdown-commands.test.ts tests/components/MarkdownEditor.test.tsx
git commit -m "feat: add configurable Markdown table insertion"
```

### Task 4: Editable Table Widget, DOM Reuse, and IME Safety

**Files:**
- Create: `src/editor/live-table-widget.ts`
- Modify: `src/editor/live-markdown.ts`
- Modify: `src/editor/editor.css`
- Modify: `tests/unit/live-markdown.test.ts`
- Modify: `tests/components/MarkdownEditor.test.tsx`

**Interfaces:**
- Consumes: all Task 1 table model APIs.
- Produces:

```ts
export class EditableTableWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly table: MarkdownTableModel,
    readonly disabled: boolean,
  )
}
```

- Produces DOM contract:
  - root `.cm-md-table[data-table-from][data-table-to]`
  - scroll container `.cm-md-table-scroll`
  - inputs with `data-row`, `data-column`, and accessible name `第 N 行第 M 列`
  - row 0 uses `<th>`, data rows use `<td>`

- [ ] **Step 1: Write failing rendering and editing tests**

Extend the real `EditorView` helper in `tests/unit/live-markdown.test.ts` with a complete table and selection outside it:

```ts
const source = '| 名称 | 值 |\n| --- | --- |\n| 格式 | WebP |'
const view = createView(`正文\n\n${source}`, 0)
const table = view.dom.querySelector<HTMLDivElement>('.cm-md-table')!
const first = table.querySelector<HTMLInputElement>('input[data-row="0"][data-column="0"]')!

expect(table.querySelectorAll('thead th')).toHaveLength(2)
expect(table.querySelectorAll('tbody tr')).toHaveLength(1)
expect(first).toHaveValue('名称')

first.focus()
first.setSelectionRange(1, 1)
first.value = '名|称'
first.dispatchEvent(new InputEvent('input', { bubbles: true, data: '|' }))

expect(view.state.doc.toString()).toContain('| 名\\|称 | 值 |')
expect(view.dom.querySelector('.cm-md-table')).toBe(table)
expect(document.activeElement).toBe(first)
expect(first.selectionStart).toBe(1)
```

Add tests proving source mode has no widget, invalid unequal rows remain literal, and `disabled: true` makes every table input read-only.

In `tests/components/MarkdownEditor.test.tsx`, open the table dialog, confirm its defaults,
and use `waitFor` to assert that the inserted widget's `第 1 行第 1 列` input receives
focus with its complete `列 1` value selected. This completes the focus handoff prepared
in Task 3 without changing the editor instance.

- [ ] **Step 2: Write a failing composition test**

```ts
const before = view.state.doc.toString()
first.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
first.value = '拼'
first.dispatchEvent(new InputEvent('input', { bubbles: true, data: '拼', isComposing: true }))
expect(view.state.doc.toString()).toBe(before)

first.value = '拼音'
first.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '拼音' }))
expect(view.state.doc.toString()).toContain('| 拼音 | 值 |')
```

- [ ] **Step 3: Run the widget tests and verify RED**

Run: `npm test -- tests/unit/live-markdown.test.ts`

Expected: FAIL because GFM `Table` nodes are still shown as source.

- [ ] **Step 4: Detect only losslessly editable GFM tables**

In `buildDecorations`, handle `Table` before marker hiding. Slice `node.from..node.to`, parse with `parseMarkdownTable`, and add this block replacement only when parsing succeeds:

```ts
ranges.push(Decoration.replace({
  block: true,
  widget: new EditableTableWidget(node.from, node.to, table, options.disabled),
}).range(node.from, node.to))
return false
```

Leave invalid tables untouched. Keep source-mode early return unchanged.

- [ ] **Step 5: Build DOM with a replaceable binding instead of stale closures**

Store the newest widget and view on the root element through a module-private symbol:

```ts
interface TableBinding {
  widget: EditableTableWidget
  view: EditorView
  active: TableCellPosition
  composing: string | null
}
```

Event listeners must read `root[bindingKey]` at event time; they must not capture the old `from`, `to`, or model. On input outside composition, call `replaceTableCell`, serialize it, and dispatch exactly:

```ts
view.dispatch({
  changes: { from: widget.from, to: widget.to, insert: serializeMarkdownTable(next) },
  annotations: Transaction.userEvent.of('input.type'),
})
```

Return `true` from `ignoreEvent` so CodeMirror does not reinterpret input clicks or keystrokes.

- [ ] **Step 6: Reuse and patch the widget DOM**

Implement `eq` for identical range/model/disabled content and `updateDOM(dom, view)` for changed content. Before patching, record whether a cell input is active plus its `selectionStart` and `selectionEnd`; update the root binding, row/cell structure, values, and disabled state; then restore the same surviving input and clamped selection. Do not overwrite the active composing input. Return `true` so CodeMirror does not replace the root.

- [ ] **Step 7: Commit IME only at composition end**

Set `binding.composing` to the cell key on `compositionstart`. Ignore `input` dispatches for that key while composing. On `compositionend`, clear the key and send one normal cell transaction using the input's final value.

- [ ] **Step 8: Add responsive table presentation and verify GREEN**

Use semantic `<table>`, `border-collapse: collapse`, Studio paper/line/input colors, and a `.cm-md-table-scroll { max-width: 100%; overflow-x: auto; }` wrapper. Give cells a practical minimum width without increasing `.cm-content` or page width. The table widget itself must be `max-width: 100%`.

Run:

```bash
npm test -- tests/unit/table-model.test.ts tests/unit/live-markdown.test.ts tests/components/MarkdownEditor.test.tsx
npm run lint
npm run typecheck
```

Expected: PASS for rendering, literal fallback, cell writes, escaped pipes, DOM identity, caret preservation, IME batching, disabled state, and source mode.

- [ ] **Step 9: Commit**

```bash
git add src/editor/live-table-widget.ts src/editor/live-markdown.ts src/editor/editor.css tests/unit/live-markdown.test.ts tests/components/MarkdownEditor.test.tsx
git commit -m "feat: edit GFM tables in instant mode"
```

### Task 5: Keyboard Navigation, Undo, and Structural Controls

**Files:**
- Modify: `src/editor/live-table-widget.ts`
- Modify: `src/editor/editor.css`
- Modify: `tests/unit/live-markdown.test.ts`

**Interfaces:**
- Consumes: Task 2 row/column mutations.
- Produces buttons named:
  - `在当前行下方添加一行`
  - `删除当前行`
  - `在当前列右侧添加一列`
  - `删除当前列`

- [ ] **Step 1: Write failing Tab and history tests**

Add `history()` to the test editor extensions. Focus the first cell, dispatch `Tab`, and assert the second cell is focused; dispatch `Shift+Tab` and assert the first returns. Assert `Tab` on the last cell stays there and does not add a row.

Edit a cell, then dispatch:

```ts
input.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
}))
expect(view.state.doc.toString()).toBe(original)

input.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
}))
expect(view.state.doc.toString()).toContain('修改后')
```

Add the same redo assertion for `Ctrl+Y`; the handler must also accept `Meta+Z` and `Meta+Shift+Z` in production.

- [ ] **Step 2: Write failing structural-control tests**

Focus a data cell, click each control, and assert exact serialized Markdown plus focus position. Assert adding a row/column can be undone in one `undo(view)` call. Focus the header and assert “删除当前行” is disabled. Build minimum and maximum models and assert buttons disable at 1/20 rows and 2/8 columns. Create a disabled editor and assert all four structural controls are disabled.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/unit/live-markdown.test.ts`

Expected: FAIL because the widget has no keyboard or structure controls.

- [ ] **Step 4: Implement focus tracking and Tab navigation**

On every cell `focus`, write its position to `binding.active`. On `Tab`, call `preventDefault`, flatten the current inputs in row-major order, and focus the adjacent input only when one exists. Do not dispatch a document transaction for navigation.

- [ ] **Step 5: Delegate undo and redo to CodeMirror**

Import `undo` and `redo` from `@codemirror/commands`. For a modifier plus `z`, prevent the input's native history and call `undo(view)` or `redo(view)` depending on `shiftKey`; also map `Ctrl+Y` to `redo(view)`. Do not maintain a separate input history stack.

- [ ] **Step 6: Dispatch one transaction per structural operation**

Render a compact control bar above the scroll wrapper. On button `mousedown`, prevent focus from leaving the active cell. On click, apply the corresponding pure mutation and replace only `widget.from..widget.to` with `serializeMarkdownTable(mutation.table)` in one transaction using `Transaction.userEvent.of('input')`.

After dispatch, use `view.requestMeasure({ write() { ... } })` to query the returned `mutation.focus`, focus it, and select its contents. Disabled state comes from the pure operation returning `null`, plus the editor-wide `disabled` option.

- [ ] **Step 7: Style controls and verify GREEN**

Make `.cm-md-table-controls` wrap within the widget and use compact transparent Studio buttons. Keep visible `:focus-visible` rings on buttons and inputs. No control may expand the document width.

Run:

```bash
npm test -- tests/unit/live-markdown.test.ts
npm run lint
npm run typecheck
```

Expected: PASS for Tab order, boundary behavior, undo/redo, one-step structural history, focus relocation, and all limits.

- [ ] **Step 8: Commit**

```bash
git add src/editor/live-table-widget.ts src/editor/editor.css tests/unit/live-markdown.test.ts
git commit -m "feat: manage table rows and columns"
```

### Task 6: End-to-End Workflow, Documentation, and Full Regression

**Files:**
- Modify: `tests/e2e/editor.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Verifies the complete path: toolbar → dialog → instant widget → Markdown transaction → autosave → source mode → preview → responsive layout.

- [ ] **Step 1: Write the failing browser workflow**

Add one Playwright test that:

1. enters the article workspace and clicks “表格”;
2. verifies defaults `3` columns and `2` data rows, changes to 2×1, and inserts;
3. verifies the first header cell is focused and selected;
4. fills header/data cells, including `A|B`, and uses `Tab`/`Shift+Tab`;
5. adds one row and one column, then uses `ControlOrMeta+Z` to undo and redo;
6. waits for `已保存到本地草稿`;
7. switches to source mode and expects `A\\|B` plus exact row/column counts;
8. opens preview and verifies its semantic table cell text;
9. repeats the editor assertions at 390×844 and proves `document.documentElement.scrollWidth <= innerWidth` while `.cm-md-table-scroll` contains any table-only horizontal overflow.

Use role/name selectors for dialog fields, cells, and structural buttons; use `.cm-md-table` only for the widget boundary and internal-overflow measurement.

- [ ] **Step 2: Run Chromium and verify RED**

Run: `npx playwright test tests/e2e/editor.spec.ts --project=chromium --grep 'creates and edits a Markdown table'`

Expected: FAIL until all widget focus, history, and responsive behavior is connected in the real browser.

- [ ] **Step 3: Fix only integration defects exposed by the browser test**

Keep fixes inside the files introduced or modified by Tasks 1–5. Do not change preview parsing: the existing `remark-gfm` preview pipeline already renders standard GFM tables. If the source does not preview correctly, correct the generated Markdown or widget serializer instead.

- [ ] **Step 4: Update the user documentation**

In the “写作与导出流程” section, state that “表格” opens a 2–8 column and 1–20 data-row chooser; instant mode supports direct cell editing and row/column controls; source mode retains literal GFM; table edits share normal undo and autosave; and wide tables scroll inside the editor rather than widening the page.

- [ ] **Step 5: Run focused three-browser verification**

Run:

```bash
npx playwright test tests/e2e/editor.spec.ts --grep 'creates and edits a Markdown table|live writing|authors'
```

Expected: PASS in Chromium, Firefox, and WebKit for table editing, existing live Markdown, autosave/export/import, and preview.

- [ ] **Step 6: Run the complete verification gate**

```bash
npm run lint
npm run typecheck
npm test
npm run check:standalone
npm run build
npm run test:e2e
git diff --check
git status --short
```

Expected: every command exits 0; all unit/component tests and all Playwright projects pass; `git diff --check` prints nothing; `git status --short` lists only the intended table feature and documentation changes before the final commit.

- [ ] **Step 7: Commit the browser coverage and README**

```bash
git add tests/e2e/editor.spec.ts README.md
git commit -m "test: cover Markdown table authoring workflow"
```

- [ ] **Step 8: Review the final branch without pushing**

Run:

```bash
git status --short --branch
git log --oneline --decorate -10
git diff origin/main...HEAD --stat
```

Expected: the branch is clean and ahead of `origin/main`; no push or merge occurs until the user explicitly requests it.

import { describe, expect, test } from 'vitest'
import {
  addTableColumn,
  addTableRow,
  deleteTableColumn,
  deleteTableRow,
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

  test('accepts rows without optional outer pipes', () => {
    expect(parseMarkdownTable('名称 | 数量\n--- | ---:\nA | 2')).toEqual({
      header: ['名称', '数量'],
      alignments: ['none', 'right'],
      rows: [['A', '2']],
    })
  })

  test.each([
    '| A | B |\n| --- | --- |\n| only one |',
    '| A | B |\n| --- |\n| 1 | 2 |',
    '| A |\n| --- |\n| 1 |',
    '| A | B |\n| --- | --- |',
    '| A | B |\n| -- | --- |\n| 1 | 2 |',
  ])('rejects a table that cannot be edited losslessly: %s', (source) => {
    expect(parseMarkdownTable(source)).toBeNull()
  })

  test('serializes a cell edit with escaped pipes and no real newline', () => {
    const table = parseMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |')!
    const edited = replaceTableCell(table, { row: 1, column: 0 }, '甲|乙\n丙')

    expect(serializeMarkdownTable(edited)).toBe(
      '| A | B |\n| --- | --- |\n| 甲\\|乙 丙 | 2 |',
    )
    expect(table.rows).toEqual([['1', '2']])
  })

  test('preserves delimiter alignment while editing the header', () => {
    const table = parseMarkdownTable('| A | B |\n| :--- | ---: |\n| 1 | 2 |')!

    expect(serializeMarkdownTable(replaceTableCell(table, { row: 0, column: 1 }, '名称'))).toBe(
      '| A | 名称 |\n| :--- | ---: |\n| 1 | 2 |',
    )
  })

  test('adds a data row below the active row and after the header', () => {
    const table = parseMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |')!

    expect(addTableRow(table, { row: 0, column: 1 })).toEqual({
      table: {
        ...table,
        rows: [['内容', '内容'], ['1', '2']],
      },
      focus: { row: 1, column: 1 },
    })
    expect(addTableRow(table, { row: 1, column: 0 })).toEqual({
      table: {
        ...table,
        rows: [['1', '2'], ['内容', '内容']],
      },
      focus: { row: 2, column: 0 },
    })
    expect(table.rows).toEqual([['1', '2']])
  })

  test('deletes a data row and focuses the nearest surviving row', () => {
    const table = parseMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |')!

    expect(deleteTableRow(table, { row: 2, column: 1 })).toEqual({
      table: { ...table, rows: [['1', '2'], ['5', '6']] },
      focus: { row: 2, column: 1 },
    })
    expect(deleteTableRow(table, { row: 3, column: 0 })?.focus).toEqual({ row: 2, column: 0 })
  })

  test('adds and deletes a column while preserving alignment and nearest focus', () => {
    const table = parseMarkdownTable('| A | B |\n| :--- | ---: |\n| 1 | 2 |')!
    const added = addTableColumn(table, { row: 1, column: 0 })!

    expect(added).toEqual({
      table: {
        header: ['A', '列 2', 'B'],
        alignments: ['left', 'none', 'right'],
        rows: [['1', '内容', '2']],
      },
      focus: { row: 1, column: 1 },
    })
    expect(deleteTableColumn(added.table, added.focus)).toEqual({
      table,
      focus: { row: 1, column: 1 },
    })
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
})

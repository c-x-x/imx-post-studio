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
})

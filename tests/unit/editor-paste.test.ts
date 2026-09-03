import { describe, expect, it } from 'vitest'
import { containsPastedMarkdown } from '../../src/editor/paste'

describe('Markdown paste detection', () => {
  it.each([
    ['heading', '## 标题\n\n正文'],
    ['fenced code', '```bash\ngit add .\n```'],
    ['tilde fence', '~~~js\nconsole.log(1)\n~~~'],
    ['blockquote', '> 引用'],
    ['unordered list', '- 第一项\n- 第二项'],
    ['ordered list', '1. 第一项\n2. 第二项'],
    ['table', '| A | B |\n| --- | --- |\n| 1 | 2 |'],
    ['bold', '这是 **加粗** 内容'],
    ['italic', '这是 *斜体* 内容'],
    ['strike', '这是 ~~删除~~ 内容'],
    ['inline code', '运行 `npm test`'],
    ['link', '[站点](https://example.com)'],
    ['image', '![图片](images/example.png)'],
    ['math', '$E=mc^2$'],
    ['footnote', '正文[^1]\n\n[^1]: 注解'],
    ['semantic tag', '<mark>高亮</mark>'],
  ])('recognizes %s', (_name, markdown) => {
    expect(containsPastedMarkdown(markdown)).toBe(true)
  })

  it.each([
    '',
    '这是普通文字',
    '这是普通文字\n没有 Markdown 标记',
    'https://example.com',
    '价格是 1 * 2 * 3',
    '文件名是 note_v2_final',
    '井号#不在行首也没有空格',
  ])('leaves ordinary text unchanged: %s', (text) => {
    expect(containsPastedMarkdown(text)).toBe(false)
  })
})

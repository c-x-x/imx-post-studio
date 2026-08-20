import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownEditor, type MarkdownEditorHandle } from '../../src/editor/MarkdownEditor'

afterEach(cleanup)

function ControlledEditor({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return <><output data-testid="markdown">{value}</output><MarkdownEditor value={value} onChange={setValue} media={[]} /></>
}

describe('MarkdownEditor', () => {
  it('renders Markdown as structured editable content', () => {
    render(<ControlledEditor initial={'# 标题\n\n正文'} />)
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    expect(within(editor).getByRole('heading', { level: 1 })).toHaveTextContent('标题')
    expect(within(editor).getByText('正文').tagName).toBe('P')
  })

  it('exposes the active format as a pressed toolbar control', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor initial={'## 标题\n\n正文'} />)
    const heading = screen.getByRole('button', { name: '标题' })
    expect(heading).toHaveAttribute('aria-pressed', 'true')
    await user.click(heading)
    expect(heading).toHaveAttribute('aria-pressed', 'false')
  })

  it('creates an editable table and exposes structural actions', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor />)
    await user.click(screen.getByRole('button', { name: '表格' }))
    const dialog = screen.getByRole('dialog', { name: '插入表格' })
    await user.clear(within(dialog).getByLabelText('列数'))
    await user.type(within(dialog).getByLabelText('列数'), '2')
    await user.clear(within(dialog).getByLabelText('数据行数'))
    await user.type(within(dialog).getByLabelText('数据行数'), '1')
    await user.click(within(dialog).getByRole('button', { name: '插入' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除表格' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
  })

  it('renders and round-trips centered table columns', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor initial={'| 名称 | 状态 |\n| :---: | --- |\n| A | B |'} />)
    expect(screen.getAllByRole('columnheader')[0]).toHaveStyle({ textAlign: 'center' })
    await user.click(screen.getByRole('button', { name: '源代码' }))
    expect(await screen.findByRole('textbox', { name: 'Markdown 编辑器' })).toHaveTextContent('| :---: |')
  })

  it('round-trips tables, tasks and fenced code through source mode', async () => {
    const user = userEvent.setup()
    const markdown = '- [x] 完成\n\n| 名称 | 状态 |\n| --- | --- |\n| 表格 | 可编辑 |\n\n```bash\necho ok\n```'
    render(<ControlledEditor initial={markdown} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
    await user.click(screen.getByRole('button', { name: '源代码' }))
    expect(await screen.findByRole('textbox', { name: 'Markdown 编辑器' })).toHaveTextContent('echo ok')
    await user.click(screen.getByRole('button', { name: '即时排版' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
    const highlightedCode = screen.getByRole('textbox', { name: 'Markdown 编辑器' }).querySelector('pre code')
    expect(highlightedCode).toHaveTextContent('echo ok')
    expect(highlightedCode?.querySelector('.hljs-built_in')).toHaveTextContent('echo')
  })

  it('inserts media into the current source document without restoring stale rich text', async () => {
    const user = userEvent.setup()
    const editorRef = createRef<MarkdownEditorHandle>()
    function RefEditor() {
      const [value, setValue] = useState('旧正文')
      return <>
        <output data-testid="markdown">{value}</output>
        <button type="button" onClick={() => setValue('源码中的新正文')}>修改源码值</button>
        <button type="button" onClick={() => editorRef.current?.insertImage('photo.jpg', 'photo')}>插入媒体</button>
        <MarkdownEditor ref={editorRef} value={value} onChange={setValue} media={[]} />
      </>
    }
    render(<RefEditor />)
    await user.click(screen.getByRole('button', { name: '源代码' }))
    await user.click(screen.getByRole('button', { name: '修改源码值' }))
    await user.click(screen.getByRole('button', { name: '插入媒体' }))
    expect(screen.getByTestId('markdown')).toHaveTextContent('源码中的新正文')
    expect(screen.getByTestId('markdown')).toHaveTextContent('![photo](images/photo.jpg)')
    expect(screen.getByTestId('markdown')).not.toHaveTextContent('旧正文')
  })

})

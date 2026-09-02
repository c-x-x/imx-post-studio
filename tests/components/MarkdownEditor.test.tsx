import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownEditor, type MarkdownEditorHandle } from '../../src/editor/MarkdownEditor'

afterEach(cleanup)

function ControlledEditor({ initial = '', initialMode = 'rich' }: { initial?: string, initialMode?: 'rich' | 'source' }) {
  const [value, setValue] = useState(initial)
  return <><output data-testid="markdown">{value}</output><MarkdownEditor initialMode={initialMode} value={value} onChange={setValue} media={[]} /></>
}

describe('MarkdownEditor', () => {
  it('applies the selected writing font to rich and source modes', async () => {
    const { container, rerender } = render(<MarkdownEditor font="sans" value="正文" onChange={() => undefined} media={[]} />)
    const editor = container.querySelector('.markdown-editor')
    expect(editor).toHaveAttribute('data-font', 'sans')
    rerender(<MarkdownEditor initialMode="source" font="sans" value="正文" onChange={() => undefined} media={[]} />)
    await screen.findByRole('textbox', { name: 'Markdown 编辑器' })
    expect(editor).toHaveAttribute('data-font', 'sans')
  })

  it('exposes the self-hosted art font choices without changing Markdown', () => {
    const { container, rerender } = render(<MarkdownEditor font="wenkai" value="艺术字体" onChange={() => undefined} media={[]} />)
    const editor = container.querySelector('.markdown-editor')
    expect(editor).toHaveAttribute('data-font', 'wenkai')
    rerender(<MarkdownEditor font="smiley" value="艺术字体" onChange={() => undefined} media={[]} />)
    expect(editor).toHaveAttribute('data-font', 'smiley')
    expect(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).toHaveTextContent('艺术字体')
  })

  it('can start directly in source mode without switching the current document later', async () => {
    render(<MarkdownEditor initialMode="source" value="Source first" onChange={() => undefined} media={[]} />)
    expect(await screen.findByRole('textbox', { name: 'Markdown 编辑器' })).toHaveTextContent('Source first')
    expect(screen.getByRole('region', { name: 'Markdown 编辑' })).toHaveAttribute('data-mode', 'source')
    expect(screen.queryByRole('button', { name: /源代码|即时排版/ })).not.toBeInTheDocument()
  })
  it('inserts visible links using an accessible dialog and rejects unsafe addresses', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor />)
    await user.click(screen.getByRole('button', { name: '链接' }))
    let dialog = screen.getByRole('dialog', { name: '插入链接' })
    await user.type(within(dialog).getByLabelText('链接地址'), 'javascript:alert(1)')
    await user.click(within(dialog).getByRole('button', { name: '插入链接' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('有效地址')
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.getByTestId('markdown')).toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: '链接' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '链接' }))
    dialog = screen.getByRole('dialog', { name: '插入链接' })
    await user.type(within(dialog).getByLabelText('链接地址'), 'https://example.com')
    await user.click(within(dialog).getByRole('button', { name: '插入链接' }))
    expect(within(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).getByRole('link', { name: 'https://example.com' })).toHaveAttribute('href', 'https://example.com')
    expect(screen.getByTestId('markdown')).toHaveTextContent('[https://example.com](https://example.com)')
  })

  it('renders Markdown as structured editable content', () => {
    render(<ControlledEditor initial={'# 标题\n\n正文'} />)
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    expect(within(editor).getByRole('heading', { level: 1 })).toHaveTextContent('标题')
    expect(within(editor).getByText('正文').tagName).toBe('P')
  })

  it('exposes the active format as a pressed toolbar control', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor />)
    const paragraph = screen.getByRole('button', { name: '正文' })
    const heading = screen.getByRole('button', { name: 'H2' })
    expect(paragraph).toHaveAttribute('aria-pressed', 'true')
    await user.click(heading)
    expect(heading).toHaveAttribute('aria-pressed', 'true')
    await user.click(paragraph)
    expect(paragraph).toHaveAttribute('aria-pressed', 'true')
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

  it('inserts formulas through the dialog and keeps editable Markdown source', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor />)
    await user.click(screen.getByRole('button', { name: '行内公式' }))
    const inlineDialog = screen.getByRole('dialog', { name: '插入行内公式' })
    await user.type(within(inlineDialog).getByLabelText('LaTeX'), 'E=mc^2')
    await user.click(within(inlineDialog).getByRole('button', { name: '插入' }))
    expect(screen.getByTestId('markdown')).toHaveTextContent('$E=mc^2$')

    await user.click(screen.getByRole('button', { name: '公式块' }))
    const blockDialog = screen.getByRole('dialog', { name: '插入公式块' })
    await user.type(within(blockDialog).getByLabelText('LaTeX'), '\\int_0^1 x dx')
    await user.click(within(blockDialog).getByRole('button', { name: '插入' }))
    expect(screen.getByTestId('markdown')).toHaveTextContent('$$')
    expect(screen.getByTestId('markdown')).toHaveTextContent('\\int_0^1 x dx')
  })

  it('opens the slash menu only in an empty paragraph and runs its command', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor />)
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    editor.focus()
    await user.keyboard('/')
    const dialog = screen.getByRole('dialog', { name: '快速插入' })
    await user.click(within(dialog).getByRole('button', { name: /二级标题/ }))
    expect(screen.queryByRole('dialog', { name: '快速插入' })).not.toBeInTheDocument()
    expect(within(editor).getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(screen.getByTestId('markdown')).not.toHaveTextContent('/')
  })

  it('exposes focus and typewriter preferences without changing document content', () => {
    const { container } = render(<MarkdownEditor focusMode typewriterMode value="正文" onChange={() => undefined} media={[]} />)
    const editor = container.querySelector('.markdown-editor')
    expect(editor).toHaveAttribute('data-focus-mode', 'true')
    expect(editor).toHaveAttribute('data-typewriter-mode', 'true')
    expect(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).toHaveTextContent('正文')
  })

  it('disables unsupported text formatting inside code instead of silently doing nothing', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor />)
    await user.click(screen.getByRole('button', { name: '代码块' }))
    expect(screen.getByRole('button', { name: '加粗' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '斜体' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '代码块' }))
    expect(screen.getByRole('button', { name: '加粗' })).toBeEnabled()
  })

  it('renders and round-trips centered table columns', async () => {
    const { rerender } = render(<ControlledEditor initial={'| 名称 | 状态 |\n| :---: | --- |\n| A | B |'} />)
    expect(screen.getAllByRole('columnheader')[0]).toHaveStyle({ textAlign: 'center' })
    rerender(<ControlledEditor initial={'| 名称 | 状态 |\n| :---: | --- |\n| A | B |'} initialMode="source" />)
    expect(await screen.findByRole('textbox', { name: 'Markdown 编辑器' })).toHaveTextContent('| :---: |')
  })

  it('round-trips tables, tasks and fenced code through source mode', async () => {
    const markdown = '- [x] 完成\n\n| 名称 | 状态 |\n| --- | --- |\n| 表格 | 可编辑 |\n\n```bash\necho ok\n```'
    const { rerender } = render(<ControlledEditor initial={markdown} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
    rerender(<ControlledEditor initial={markdown} initialMode="source" />)
    expect(await screen.findByRole('textbox', { name: 'Markdown 编辑器' })).toHaveTextContent('echo ok')
    rerender(<ControlledEditor initial={markdown} initialMode="rich" />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    const highlightedCode = screen.getByRole('textbox', { name: 'Markdown 编辑器' }).querySelector('pre code')
    expect(highlightedCode).toHaveTextContent('echo ok')
    expect(highlightedCode?.querySelector('.hljs-built_in')).toHaveTextContent('echo')
  })

  it('exposes working source history controls in the stable status bar', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor initial="初始内容" initialMode="source" />)
    const source = await screen.findByRole('textbox', { name: 'Markdown 编辑器' })
    await user.click(source)
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
    await user.type(source, '新增')
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.getByTestId('markdown')).not.toHaveTextContent('新增')
    expect(screen.getByRole('button', { name: '重做' })).toBeEnabled()
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
        <MarkdownEditor ref={editorRef} initialMode="source" value={value} onChange={setValue} media={[]} />
      </>
    }
    render(<RefEditor />)
    await screen.findByRole('textbox', { name: 'Markdown 编辑器' })
    await user.click(screen.getByRole('button', { name: '修改源码值' }))
    await user.click(screen.getByRole('button', { name: '插入媒体' }))
    expect(screen.getByTestId('markdown')).toHaveTextContent('源码中的新正文')
    expect(screen.getByTestId('markdown')).toHaveTextContent('![photo](images/photo.jpg)')
    expect(screen.getByTestId('markdown')).not.toHaveTextContent('旧正文')
  })

})

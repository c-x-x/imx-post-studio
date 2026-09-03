import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    const { container, rerender } = render(<MarkdownEditor font="wenkai" value="正文" onChange={() => undefined} media={[]} />)
    const editor = container.querySelector('.markdown-editor')
    expect(editor).toHaveAttribute('data-font', 'wenkai')
    rerender(<MarkdownEditor initialMode="source" font="wenkai" value="正文" onChange={() => undefined} media={[]} />)
    await screen.findByRole('textbox', { name: 'Markdown 编辑器' })
    expect(editor).toHaveAttribute('data-font', 'wenkai')
  })

  it('exposes the self-hosted art font without changing Markdown', () => {
    const { container } = render(<MarkdownEditor font="wenkai" value="艺术字体" onChange={() => undefined} media={[]} />)
    const editor = container.querySelector('.markdown-editor')
    expect(editor).toHaveAttribute('data-font', 'wenkai')
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

  it('parses complete standard Markdown when pasted', async () => {
    render(<ControlledEditor />)
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    const markdown = [
      '## 主题',
      '',
      '包含 **加粗**、*斜体* 与 ~~删除线~~。',
      '',
      '```bash',
      'git add .',
      'git commit -m "test"',
      '```',
      '',
      '- 第一项',
      '- 第二项',
    ].join('\n')
    fireEvent.paste(editor, { clipboardData: {
      files: [],
      items: [],
      getData: (type: string) => type === 'text/plain' ? markdown : '',
    } })

    expect(within(editor).getByRole('heading', { level: 2, name: '主题' })).toBeInTheDocument()
    expect(editor.querySelector('strong')).toHaveTextContent('加粗')
    expect(editor.querySelector('em')).toHaveTextContent('斜体')
    expect(editor.querySelector('s')).toHaveTextContent('删除线')
    expect(editor.querySelector('pre code')).toHaveTextContent('git add .')
    expect(within(editor).getAllByRole('listitem')).toHaveLength(2)
    await waitFor(() => expect(screen.getByTestId('markdown')).toHaveTextContent('```bash'))
  })

  it('always keeps one clickable empty caret line below the current last line', async () => {
    render(<ControlledEditor initial="第一行" />)
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    await waitFor(() => expect(editor.querySelectorAll(':scope > p')).toHaveLength(2))
    expect(editor.querySelector(':scope > p:last-child')?.textContent).toBe('')
    expect(screen.getByTestId('markdown').textContent).toBe('第一行')
  })

  it('opens image blocks as Markdown source and degrades broken syntax to plain text', async () => {
    const user = userEvent.setup()
    const { container } = render(<ControlledEditor initial="![photo](images/photo.jpg)" />)
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    const preview = screen.getByLabelText('图片预览')
    expect(preview.querySelector('img')).toHaveAttribute('src', 'images/photo.jpg')
    await waitFor(() => expect(editor.querySelector(':scope > p:last-child')).toBeInTheDocument())

    await user.click(preview)
    const source = screen.getByLabelText('图片 Markdown 源码')
    await waitFor(() => expect(source).toHaveFocus())
    expect(source).toHaveValue('![photo](images/photo.jpg)')
    ;(source as HTMLTextAreaElement).setSelectionRange(source.textContent?.length ?? 0, source.textContent?.length ?? 0)
    await user.keyboard('{End}{Backspace}')

    expect(container.querySelector('.image-block-view')).not.toBeInTheDocument()
    expect(editor).toHaveTextContent('![photo](images/photo.jpg')
    expect(editor).toHaveFocus()
    await user.keyboard(')')
    await waitFor(() => expect(container.querySelector('.image-block-view')).toBeInTheDocument())
    expect(screen.queryByLabelText('图片 Markdown 源码')).not.toBeInTheDocument()
    expect(screen.getByTestId('markdown')).toHaveTextContent('![photo](images/photo.jpg)')
  })

  it('loads safe semantic text-style tags as editable marks', () => {
    render(<ControlledEditor initial="<mark>高亮</mark> <sub>下标</sub> <sup>上标</sup>" />)
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    expect(editor.querySelector('mark')).toHaveTextContent('高亮')
    expect(editor.querySelector('sub')).toHaveTextContent('下标')
    expect(editor.querySelector('sup')).toHaveTextContent('上标')
  })

  it('exposes the rendered heading as a pressed toolbar control', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor />)
    const paragraph = screen.getByRole('button', { name: '正文' })
    const heading = screen.getByRole('button', { name: 'H2' })
    expect(paragraph).toHaveAttribute('aria-pressed', 'true')
    await user.click(heading)
    expect(heading).toHaveAttribute('aria-pressed', 'true')
    expect(paragraph).toHaveAttribute('aria-pressed', 'false')
    expect(within(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).getByRole('heading', { level: 2 })).toBeInTheDocument()
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

  it('keeps inline formula writing support without exposing a toolbar button', () => {
    const { container } = render(<ControlledEditor initial="能量 $E=mc^2$" />)
    expect(screen.queryByRole('button', { name: '行内公式' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-math="inline"] .katex')).toBeInTheDocument()
    expect(screen.getByTestId('markdown')).toHaveTextContent('$E=mc^2$')
  })

  it('edits block formulas in the document and collapses their source on outside click', async () => {
    const user = userEvent.setup()
    const { container } = render(<ControlledEditor />)
    await user.click(screen.getByRole('button', { name: '公式块' }))
    expect(screen.queryByRole('dialog', { name: '插入公式块' })).not.toBeInTheDocument()
    const source = await screen.findByLabelText('LaTeX 源码')
    await waitFor(() => expect(source).toHaveFocus())
    expect(screen.queryByText('LaTeX 源码')).not.toBeInTheDocument()
    expect(screen.getByText('Empty Math Block')).toBeInTheDocument()
    expect(source).toHaveValue('$$\n\n$$')
    expect((source as HTMLTextAreaElement).selectionStart).toBe(3)
    await user.keyboard('\\int_0^1 x dx')
    expect(screen.getByTestId('markdown')).toHaveTextContent('$$')
    expect(screen.getByTestId('markdown')).toHaveTextContent('\\int_0^1 x dx')
    expect(screen.getByLabelText('公式预览').querySelector('.katex')).toBeInTheDocument()
    await user.click(screen.getByText('可以开始写作'))
    expect(screen.queryByLabelText('LaTeX 源码')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('公式预览'))
    const reopenedSource = screen.getByLabelText('LaTeX 源码')
    await waitFor(() => expect(reopenedSource).toHaveFocus())
    await user.clear(reopenedSource)
    expect(container.querySelector('.math-block-view')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).toHaveFocus()
  })

  it('inserts callouts from a type selection dialog and focuses their inline body', async () => {
    const user = userEvent.setup()
    const { container } = render(<ControlledEditor />)
    await user.click(screen.getByRole('button', { name: '提示块' }))
    const dialog = screen.getByRole('dialog', { name: '选择提示块' })
    expect(within(dialog).getByRole('button', { name: /提醒内容/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /建议内容/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /重要内容/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /警告内容/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /注意内容/ })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /建议内容/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const body = await screen.findByLabelText('建议内容正文')
    await waitFor(() => expect(body).toHaveFocus())
    await user.type(body, '立即输入内容')
    expect(screen.getByTestId('markdown')).toHaveTextContent('> [!TIP]')
    expect(screen.getByTestId('markdown')).toHaveTextContent('> 立即输入内容')
    expect(container.querySelector('[data-callout="tip"]')).toBeInTheDocument()
    await user.clear(body)
    expect(container.querySelector('[data-callout="tip"]')).toBeInTheDocument()
    await user.keyboard('{Backspace}')
    expect(container.querySelector('[data-callout="tip"]')).not.toBeInTheDocument()
    expect(screen.getByTestId('markdown')).not.toHaveTextContent('[!TIP]')
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    expect(editor).toHaveFocus()
    expect(container.querySelector('.ProseMirror-gapcursor')).not.toBeInTheDocument()
    await user.keyboard('x')
    expect(screen.getByTestId('markdown')).toHaveTextContent('x')
  })

  it('inserts a footnote without a modal and selects its Chinese description', async () => {
    const user = userEvent.setup()
    const { container } = render(<ControlledEditor initial="正文" />)
    await user.click(screen.getByRole('button', { name: '脚注' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const placeholder = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.footnote-definition-placeholder')
      expect(element).not.toBeNull()
      return element!
    })
    await user.click(placeholder)
    await user.keyboard('新的描述')
    expect(screen.getByTestId('markdown')).toHaveTextContent('[^1]正文')
    expect(screen.getByTestId('markdown')).toHaveTextContent('[^1]: 新的描述')
  })

  it('shows the footnote description and exposes its definition as editable content', async () => {
    const user = userEvent.setup()
    const { container } = render(<ControlledEditor initial={'正文[^1]\n\n[^1]: 原说明'} />)
    const reference = await screen.findByRole('link', { name: '脚注 1：原说明' })
    expect(reference).toHaveTextContent('[^1]')
    expect(reference).toHaveAttribute('data-description', '原说明')
    expect(container.querySelector('.footnote-definition-content')).toHaveTextContent('[^1]: 原说明')
    await user.click(reference)
  })

  it('uses one Mermaid block flow for toolbar insertion and pasted Markdown', async () => {
    const user = userEvent.setup()
    render(<ControlledEditor />)
    await user.click(screen.getByRole('button', { name: '流程图' }))
    const source = await screen.findByLabelText('Mermaid 源码')
    await waitFor(() => expect(source).toHaveFocus())
    fireEvent.change(source, { target: { value: '```mermaid\nflowchart TD\nA[开始] --> B[结束]\n```' } })
    expect(screen.getByTestId('markdown')).toHaveTextContent('```mermaid')
    expect(screen.getByTestId('markdown')).toHaveTextContent('A[开始] --> B[结束]')
    await user.click(screen.getByText('可以开始写作'))
    expect(screen.queryByLabelText('Mermaid 源码')).not.toBeInTheDocument()

    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    fireEvent.paste(editor, { clipboardData: {
      files: [],
      items: [],
      getData: (type: string) => type === 'text/plain' ? '```mermaid\nflowchart LR\nX --> Y\n```' : '',
    } })
    await waitFor(() => expect(screen.getAllByLabelText('Mermaid 流程图')).toHaveLength(2))
    expect(screen.getByTestId('markdown')).toHaveTextContent('flowchart LR')
  })

  it('auto-sizes and deletes an empty Mermaid block without stranding the caret', async () => {
    const user = userEvent.setup()
    const { container } = render(<ControlledEditor initial="正文" />)
    await user.click(screen.getByRole('button', { name: '流程图' }))
    const source = await screen.findByLabelText('Mermaid 源码')
    await waitFor(() => expect(source).toHaveFocus())
    expect(screen.getByText('Empty Mermaid Block')).toBeInTheDocument()
    expect(source).toHaveValue('```mermaid\n\n```')
    expect((source as HTMLTextAreaElement).selectionStart).toBe('```mermaid\n'.length)
    expect(source).toHaveAttribute('data-autosize', 'true')
    await user.clear(source)
    expect(container.querySelector('.mermaid-block-view')).not.toBeInTheDocument()
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    expect(editor).toHaveFocus()
    expect(container.querySelector('.ProseMirror-gapcursor')).not.toBeInTheDocument()
    await user.keyboard('x')
    expect(screen.getByTestId('markdown')).toHaveTextContent('x')
    expect(screen.getByTestId('markdown')).not.toHaveTextContent('```mermaid')
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

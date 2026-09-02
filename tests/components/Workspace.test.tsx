import { createPngBuffer } from '../helpers/test-images'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorView } from '@uiw/react-codemirror'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/App'

function pasteImage(target: HTMLElement, file: File) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      files: [file],
      getData: () => '',
    },
  })
  fireEvent(target, event)
}

describe('article workspace', () => {
  afterEach(() => {
    cleanup()
    localStorage.removeItem('imx-post-studio:settings-collapsed')
    localStorage.removeItem('imx-post-studio:actions-collapsed')
    localStorage.removeItem('imx-post-studio-theme')
  })

  it('shares one persisted theme between the app and article preview', async () => {
    localStorage.setItem('imx-post-studio-theme', 'dark')
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '写作' }))
    await user.click(screen.getByRole('button', { name: '预览文章' }))
    const preview = screen.getByTitle('IMX 文章预览')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(preview.shadowRoot?.querySelector('.preview-html')).toHaveAttribute('data-theme', 'dark')

    await user.click(within(screen.getByRole('region', { name: 'IMX 文章预览内容' })).getByRole('button', { name: '切换到浅色主题' }))
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'))
    expect(preview.shadowRoot?.querySelector('.preview-html')).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem('imx-post-studio-theme')).toBe('light')
  })

  it('collapses and restores the desktop action rail independently', async () => {
    const user = userEvent.setup()
    const first = render(<App />)

    await user.click(screen.getByRole('button', { name: '写作' }))
    const workspace = screen.getByRole('region', { name: '文章工作区' })
    expect(workspace).toHaveAttribute('data-actions-collapsed', 'false')

    await user.click(screen.getByRole('button', { name: '折叠文章操作' }))
    expect(workspace).toHaveAttribute('data-actions-collapsed', 'true')
    expect(workspace).toHaveAttribute('data-inspector-collapsed', 'false')
    expect(screen.getByRole('button', { name: '展开文章操作' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: '展开文章操作' })).toHaveFocus()

    first.unmount()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '写作' }))
    expect(screen.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-actions-collapsed', 'true')
  })

  it('keeps the writing status bar stable when content is deleted and smoothly toggles the Dock', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '写作' }))
    const status = screen.getByRole('status')
    const statusBar = status.closest('.editor-status-bar')
    expect(status).toHaveTextContent('文章编辑器已打开')
    expect(statusBar).toBeInTheDocument()

    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    await user.type(editor, '1')
    expect(status).toHaveTextContent('文章未命名')
    await user.keyboard('{Control>}a{/Control}{Backspace}')
    expect(status).toHaveTextContent('可以开始写作')
    expect(status.closest('.editor-status-bar')).toBe(statusBar)

    await user.click(screen.getByRole('button', { name: '隐藏 Dock' }))
    expect(screen.getByRole('main')).toHaveAttribute('data-dock-hidden', 'true')
    expect(document.querySelector('.imx-dock')).toHaveAttribute('data-hidden', 'true')
    expect(status).toHaveTextContent('Dock已隐藏')

    await user.click(screen.getByRole('button', { name: '恢复 Dock' }))
    expect(screen.getByRole('main')).not.toHaveAttribute('data-dock-hidden')
    expect(status).toHaveTextContent('Dock已恢复')
  })

  it('keeps metadata and cover settings on the left and body media tools in the document panel', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '写作' }))
    const settings = document.querySelector<HTMLElement>('#panel-settings')!
    const tools = document.querySelector<HTMLElement>('#panel-actions')!

    expect(within(settings).getByRole('heading', { name: '文章设置' })).toBeInTheDocument()
    expect(within(settings).getByRole('heading', { name: '文章封面' })).toBeInTheDocument()
    expect(within(settings).getByLabelText('选择封面')).toBeInTheDocument()
    expect(within(tools).getByRole('group', { name: '文章操作' })).toBeInTheDocument()
    expect(within(tools).getByRole('group', { name: '文章包操作' })).toBeInTheDocument()
    expect(within(tools).getByRole('heading', { name: '正文图片' })).toBeInTheDocument()
    await user.click(within(tools).getByRole('tab', { name: '排版' }))
    expect(within(tools).queryByRole('heading', { name: '正文图片' })).not.toBeInTheDocument()
    expect(within(tools).queryByLabelText('选择封面')).not.toBeInTheDocument()
    expect(within(tools).getByLabelText('添加正文图片')).not.toBeVisible()
    expect(within(tools).queryByRole('group', { name: '文章包操作' })).not.toBeInTheDocument()
  })

  it('switches the left sidebar to a live outline and focuses the selected heading', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '写作' }))
    expect(screen.getByRole('tab', { name: '属性' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: '大纲' }))
    expect(screen.getByText('正文中暂无标题')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '打开设置' }))
    const dialog = screen.getByRole('dialog', { name: '设置' })
    await user.click(within(dialog).getByRole('tab', { name: '编辑器' }))
    await user.click(within(dialog).getByRole('radio', { name: /源代码/ }))
    await user.click(within(dialog).getByRole('button', { name: '关闭' }))
    const textbox = await screen.findByRole('textbox', { name: 'Markdown 编辑器' })
    const editor = EditorView.findFromDOM(textbox)
    if (!editor) throw new Error('CodeMirror view not found')
    const markdown = '# 一级标题\n\n正文\n\n### 三级标题'
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: markdown } })

    const thirdLevel = await screen.findByRole('button', { name: '三级标题' })
    await user.click(thirdLevel)

    expect(editor.state.selection.main.anchor).toBe(markdown.indexOf('###'))
    expect(screen.getByRole('tab', { name: '写作' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '大纲' })).toHaveAttribute('aria-selected', 'true')
  })

  it('collapses, persists, and restores the desktop settings sidebar', async () => {
    const user = userEvent.setup()
    const first = render(<App />)

    await user.click(screen.getByRole('button', { name: '写作' }))
    const workspace = screen.getByRole('region', { name: '文章工作区' })
    const collapse = screen.getByRole('button', { name: '折叠文章设置' })
    await user.click(collapse)

    expect(workspace).toHaveAttribute('data-inspector-collapsed', 'true')
    expect(screen.getByRole('button', { name: '展开文章设置' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: '展开文章设置' })).toHaveFocus()
    first.unmount()

    render(<App />)
    await user.click(screen.getByRole('button', { name: '写作' }))
    expect(screen.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'true')
    await user.click(screen.getByRole('button', { name: '展开文章设置' }))
    expect(screen.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'false')
  })

  it('updates the IMX preview title from metadata and keeps a manually edited slug', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '写作' }))
    await user.type(screen.getByLabelText('标题'), 'Hugo 图片处理指南')
    await user.clear(screen.getByLabelText('Slug'))
    await user.type(screen.getByLabelText('Slug'), 'my-manual-slug')
    await user.click(screen.getByRole('button', { name: '生成拼音 Slug' }))

    expect(screen.getByLabelText('Slug')).toHaveValue('hugo-tu-pian-chu-li-zhi-nan')
    await user.clear(screen.getByLabelText('Slug'))
    await user.type(screen.getByLabelText('Slug'), 'my-manual-slug')
    await user.type(screen.getByLabelText('标题'), ' 新版')

    expect(screen.queryByTitle('IMX 文章预览')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '预览文章' }))
    const preview = screen.getByTitle('IMX 文章预览')
    expect(preview.shadowRoot?.textContent).toContain('Hugo 图片处理指南 新版')
    expect(screen.getByLabelText('Slug')).toHaveValue('my-manual-slug')
  })

  it('mounts preview only on request, destroys it on Escape, and restores trigger focus', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '写作' }))
    const trigger = screen.getByRole('button', { name: '预览文章' })
    expect(within(screen.getByRole('tablist', { name: '工作区视图' })).getAllByRole('tab')).toHaveLength(3)
    expect(screen.queryByTitle('IMX 文章预览')).not.toBeInTheDocument()
    expect(document.body).not.toHaveClass('preview-open')

    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'IMX 文章预览' })).toBeInTheDocument()
    expect(screen.getByTitle('IMX 文章预览')).toBeInTheDocument()
    expect(document.body).toHaveClass('preview-open')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'IMX 文章预览' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('IMX 文章预览')).not.toBeInTheDocument()
    expect(document.body).not.toHaveClass('preview-open')
    expect(trigger).toHaveFocus()
  })

  it('shows an imported body image and blocks a production export for an invalid slug', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '写作' }))

    const png = new File([new Uint8Array(createPngBuffer(1, 1))], '封面 图.PNG', { type: 'image/png' })
    await user.click(screen.getByRole('tab', { name: '文档' }))
    await user.upload(screen.getByLabelText('添加正文图片'), png)
    expect(await screen.findByRole('listitem', { name: /feng-mian-tu\.png/ })).toBeInTheDocument()

    await user.type(screen.getByLabelText('标题'), 'Exportable title')
    await user.type(screen.getByLabelText('Slug'), 'Invalid slug')
    await user.click(screen.getByRole('tab', { name: '文档' }))
    const exportArea = screen.getByRole('group', { name: '文章包操作' })
    expect(within(exportArea).getByRole('button', { name: '导出文章' })).toBeDisabled()
    expect(within(exportArea).getByText('Slug 只能包含小写英文、数字和单个连字符')).toBeInTheDocument()
  })

  it('rejects an invalid clipboard image without changing body or media', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '写作' }))
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    const invalid = new File([new Uint8Array([0x00, 0x01, 0x02])], 'broken.png', { type: 'image/png' })

    pasteImage(editor, invalid)

    expect(await screen.findByRole('status')).toHaveTextContent('图片处理失败')
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'broken.png' })).not.toBeInTheDocument())
    expect(editor).not.toHaveTextContent('images/broken.png')
  })
})

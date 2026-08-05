import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/App'

describe('article workspace', () => {
  afterEach(() => {
    cleanup()
    localStorage.removeItem('imx-post-studio:settings-collapsed')
  })

  it('collapses, persists, and restores the desktop settings sidebar', async () => {
    const user = userEvent.setup()
    const first = render(<App />)

    await user.click(screen.getByRole('button', { name: '文章' }))
    const workspace = screen.getByRole('region', { name: '文章工作区' })
    const collapse = screen.getByRole('button', { name: '折叠文章设置' })
    await user.click(collapse)

    expect(workspace).toHaveAttribute('data-inspector-collapsed', 'true')
    expect(screen.getByRole('button', { name: '展开文章设置' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: '展开文章设置' })).toHaveFocus()
    first.unmount()

    render(<App />)
    await user.click(screen.getByRole('button', { name: '文章' }))
    expect(screen.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'true')
    await user.click(screen.getByRole('button', { name: '展开文章设置' }))
    expect(screen.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'false')
  })

  it('updates the IMX preview title from metadata and keeps a manually edited slug', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '文章' }))
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
    expect(preview.getAttribute('srcdoc')).toContain('Hugo 图片处理指南 新版')
    expect(screen.getByLabelText('Slug')).toHaveValue('my-manual-slug')
  })

  it('mounts preview only on request, destroys it on Escape, and restores trigger focus', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '文章' }))
    const trigger = screen.getByRole('button', { name: '预览文章' })
    expect(screen.getAllByRole('tab')).toHaveLength(2)
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
    await user.click(screen.getByRole('button', { name: '文章' }))

    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], '封面 图.PNG', { type: 'image/png' })
    await user.upload(screen.getByLabelText('添加正文图片'), png)
    expect(screen.getByRole('listitem', { name: /feng-mian-tu\.png/ })).toBeInTheDocument()

    await user.type(screen.getByLabelText('标题'), 'Exportable title')
    await user.type(screen.getByLabelText('Slug'), 'Invalid slug')
    const exportArea = screen.getByRole('group', { name: '文章包操作' })
    expect(within(exportArea).getByRole('button', { name: '导出文章' })).toBeDisabled()
    expect(within(exportArea).getByText('Slug 只能包含小写英文、数字和单个连字符')).toBeInTheDocument()
  })
})

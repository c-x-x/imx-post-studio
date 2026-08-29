import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/App'

describe('App', () => {
  afterEach(cleanup)

  it('opens on a standalone Markdown studio introduction and guide', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'I M P S' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /切换到.*主题/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'I M P S 介绍' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'I am no bird; and no net ensnares me.' })).toBeInTheDocument()
    expect(screen.getByText('Charlotte Brontë · Jane Eyre')).toBeInTheDocument()
    expect(screen.getByText(/本地优先的 Markdown 写作工作台/)).toBeInTheDocument()
    expect(screen.queryByText('Hugo 输出')).not.toBeInTheDocument()
    expect(screen.queryByText('IMX 预览')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '作品，与 GitHub 相连' })).toBeInTheDocument()
  })

  it('uses article navigation without creating a different workspace', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '写作' }))
    await user.click(screen.getByRole('tab', { name: '排版' }))
    await user.click(screen.getByRole('button', { name: '源代码' }))
    const editor = await screen.findByRole('textbox', { name: 'Markdown 编辑器' })
    await user.type(editor, '保留当前文章')
    await user.click(screen.getByRole('button', { name: '写作' }))

    expect(editor).toHaveTextContent('保留当前文章')
    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
  })
})

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app/App'

describe('App', () => {
  afterEach(cleanup)

  it('opens on an IMX introduction and Markdown guide', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'IMX Post Studio' })).toBeInTheDocument()
    expect(screen.getByLabelText('文章和图片仅在此浏览器中处理')).toHaveTextContent('本地处理')
    expect(screen.getByRole('region', { name: 'IMX Post Studio 介绍' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '为 IMX 写作，也只在本地处理' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Markdown 语法速查' })).toBeInTheDocument()
  })

  it('uses article navigation without creating a different workspace', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '文章' }))
    const editor = screen.getByRole('textbox', { name: 'Markdown 编辑器' })
    await user.type(editor, '保留当前文章')
    await user.click(screen.getByRole('button', { name: '文章' }))

    expect(editor).toHaveTextContent('保留当前文章')
    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
  })
})

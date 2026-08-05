import { createRef } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImxDock } from '../../src/app/ImxDock'

function props(view: 'home' | 'dashboard' | 'workspace' = 'workspace') {
  return {
    view,
    disabled: false,
    previewTrigger: createRef<HTMLButtonElement>(),
    onPreview: vi.fn(),
    onHome: vi.fn(),
    onArticle: vi.fn(),
    onDashboard: vi.fn(),
  }
}

describe('IMX Studio Dock', () => {
  afterEach(cleanup)

  it('exposes the Studio actions in the IMX three-part navigation', async () => {
    const user = userEvent.setup()
    const callbacks = props()
    render(<ImxDock {...callbacks} />)

    expect(screen.getByRole('navigation', { name: 'Studio 导航' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'IMX Post Studio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '草稿库' })).toHaveAttribute('aria-current', 'false')
    await user.click(screen.getByRole('button', { name: '预览文章' }))
    await user.click(screen.getByRole('button', { name: '首页' }))
    await user.click(screen.getByRole('button', { name: '文章' }))
    await user.click(screen.getByRole('button', { name: '草稿库' }))

    expect(callbacks.onPreview).toHaveBeenCalledOnce()
    expect(callbacks.onHome).toHaveBeenCalledOnce()
    expect(callbacks.onArticle).toHaveBeenCalledOnce()
    expect(callbacks.onDashboard).toHaveBeenCalledOnce()
  })

  it('marks the dashboard action current and omits preview outside a workspace', () => {
    render(<ImxDock {...props('dashboard')} />)

    expect(screen.getByRole('button', { name: '草稿库' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: '预览文章' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('文章和图片仅在此浏览器中处理')).toHaveTextContent('本地处理')
  })

  it('marks the home and article actions current for their views', () => {
    const home = render(<ImxDock {...props('home')} />)
    expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page')
    home.unmount()

    render(<ImxDock {...props('workspace')} />)
    expect(screen.getByRole('button', { name: '文章' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens and dismisses the mobile navigation accessibly', async () => {
    const user = userEvent.setup()
    render(<ImxDock {...props()} />)
    const toggle = screen.getByRole('button', { name: '打开菜单' })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: '关闭菜单' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '打开菜单' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the mobile navigation after choosing a Studio action', async () => {
    const user = userEvent.setup()
    const callbacks = props()
    render(<ImxDock {...callbacks} />)

    await user.click(screen.getByRole('button', { name: '打开菜单' }))
    await user.click(screen.getByRole('button', { name: '文章' }))

    expect(callbacks.onArticle).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '打开菜单' })).toHaveAttribute('aria-expanded', 'false')
  })
})

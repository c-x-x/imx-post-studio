import { createRef } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
    theme: 'light' as const,
    onToggleTheme: vi.fn(),
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
    await user.click(screen.getByRole('button', { name: 'IMX Post Studio，返回首页' }))
    expect(screen.getByRole('button', { name: '草稿库' })).toHaveAttribute('aria-current', 'false')
    await user.click(screen.getByRole('button', { name: '预览文章' }))
    await user.click(screen.getByRole('button', { name: '首页' }))
    await user.click(screen.getByRole('button', { name: '文章' }))
    await user.click(screen.getByRole('button', { name: '草稿库' }))

    expect(callbacks.onPreview).toHaveBeenCalledOnce()
    expect(callbacks.onHome).toHaveBeenCalledTimes(2)
    expect(callbacks.onArticle).toHaveBeenCalledOnce()
    expect(callbacks.onDashboard).toHaveBeenCalledOnce()
  })

  it('shows a functional theme toggle outside the workspace and omits preview', async () => {
    const user = userEvent.setup()
    const callbacks = props('dashboard')
    const dock = render(<ImxDock {...callbacks} />)

    expect(screen.getByRole('button', { name: '草稿库' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: '预览文章' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换到深色主题' }))
    expect(callbacks.onToggleTheme).toHaveBeenCalledOnce()

    dock.rerender(<ImxDock {...props('workspace')} />)
    expect(screen.queryByRole('button', { name: /切换到.*主题/ })).not.toBeInTheDocument()
  })

  it('marks the home and article actions current for their views', () => {
    const home = render(<ImxDock {...props('home')} />)
    expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page')
    home.unmount()

    render(<ImxDock {...props('workspace')} />)
    expect(screen.getByRole('button', { name: '文章' })).toHaveAttribute('aria-current', 'page')
  })

  it('positions and moves the liquid indicator with the current desktop action', async () => {
    const rect = (left: number, width: number) => ({
      bottom: 54, height: 54, left, right: left + width, top: 0, width, x: left, y: 0,
      toJSON: () => ({}),
    })
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('imx-dock__menu')) return rect(100, 270)
      if (this.textContent === '首页') return rect(100, 80)
      if (this.textContent === '文章') return rect(180, 80)
      if (this.textContent === '草稿库') return rect(260, 110)
      return rect(0, 0)
    })
    const homeProps = props('home')
    const dock = render(<ImxDock {...homeProps} />)
    const menu = screen.getByRole('list')

    expect(menu).toHaveAttribute('data-liquid-indicator', 'ready')
    expect(menu.style.getPropertyValue('--indicator-width')).toBe('80.00px')
    expect(menu.style.getPropertyValue('--indicator-opacity')).toBe('1')

    dock.rerender(<ImxDock {...homeProps} view="workspace" />)
    await waitFor(() => expect(Number.parseFloat(menu.style.getPropertyValue('--indicator-x'))).toBeGreaterThan(0))
    bounds.mockRestore()
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

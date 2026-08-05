import { createRef } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImxDock } from '../../src/app/ImxDock'

function props(view: 'dashboard' | 'workspace' = 'workspace') {
  return {
    view,
    disabled: false,
    previewTrigger: createRef<HTMLButtonElement>(),
    onPreview: vi.fn(),
    onNew: vi.fn(),
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
    await user.click(screen.getByRole('button', { name: '新建文章' }))
    await user.click(screen.getByRole('button', { name: '草稿库' }))

    expect(callbacks.onPreview).toHaveBeenCalledOnce()
    expect(callbacks.onNew).toHaveBeenCalledOnce()
    expect(callbacks.onDashboard).toHaveBeenCalledOnce()
  })

  it('marks the dashboard action current and omits preview outside a workspace', () => {
    render(<ImxDock {...props('dashboard')} />)

    expect(screen.getByRole('button', { name: '草稿库' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: '预览文章' })).not.toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: '新建文章' }))

    expect(callbacks.onNew).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '打开菜单' })).toHaveAttribute('aria-expanded', 'false')
  })
})

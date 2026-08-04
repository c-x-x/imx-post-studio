import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { put, list } = vi.hoisted(() => ({ put: vi.fn(), list: vi.fn() }))

vi.mock('../../src/drafts/repository', () => ({
  draftRepository: { put, list, get: vi.fn(), duplicate: vi.fn(), rename: vi.fn(), delete: vi.fn() },
}))

import { App } from '../../src/app/App'

async function startWorkspace() {
  fireEvent.click(screen.getByRole('button', { name: '新建文章' }))
  await act(async () => { await Promise.resolve() })
}

describe('workspace transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    put.mockReset()
    list.mockReset()
    list.mockResolvedValue([])
    put.mockResolvedValue(undefined)
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('flushes the latest draft before dashboard navigation can cancel the 800 ms autosave timer', async () => {
    render(<App />)
    await startWorkspace()
    put.mockClear()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '立即保存' } })
    act(() => vi.advanceTimersByTime(799))
    expect(put).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '草稿库' }))
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ title: '立即保存' }) }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('region', { name: '草稿库' })).toBeInTheDocument()
  })

  it('keeps the workspace and offers explicit recovery/discard actions when a transition flush fails', async () => {
    render(<App />)
    await startWorkspace()
    put.mockReset()
    put.mockRejectedValueOnce(new Error('Quota exceeded'))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '不可丢失' } })
    fireEvent.click(screen.getByRole('button', { name: '草稿库' }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('保存当前草稿失败')
    expect(screen.getByRole('button', { name: '重试保存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放弃未保存更改' })).toBeInTheDocument()
  })

  it('lists and reopens the saved outgoing draft from the dashboard', async () => {
    const saved: Array<{ id: string; updatedAt: string; meta: { title: string } }> = []
    put.mockImplementation(async (draft: { id: string; updatedAt: string; meta: { title: string } }) => { saved.splice(0, saved.length, draft) })
    list.mockImplementation(async () => saved)
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '可返回的草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '草稿库' }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
    expect(screen.getByLabelText('标题')).toHaveValue('可返回的草稿')
  })

  it('freezes draft mutations while the transition snapshot is pending', async () => {
    let resolvePut: (() => void) | undefined
    put.mockImplementation(() => new Promise<void>((resolve) => { resolvePut = resolve }))
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '应被保存的版本' } })
    fireEvent.click(screen.getByRole('button', { name: '草稿库' }))

    const title = screen.getByLabelText('标题')
    expect(title).toBeDisabled()
    fireEvent.change(title, { target: { value: '不能覆盖快照' } })
    expect(put).toHaveBeenLastCalledWith(expect.objectContaining({ meta: expect.objectContaining({ title: '应被保存的版本' }) }))

    await act(async () => { resolvePut?.() })
    expect(screen.getByRole('region', { name: '草稿库' })).toBeInTheDocument()
  })

  it('does not let discard race a retry continuation', async () => {
    let resolveRetry: (() => void) | undefined
    put.mockRejectedValueOnce(new Error('Quota exceeded'))
    put.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveRetry = resolve }))
    render(<App />)
    await startWorkspace()
    fireEvent.click(screen.getByRole('button', { name: '草稿库' }))
    await act(async () => { await Promise.resolve() })

    fireEvent.click(screen.getByRole('button', { name: '重试保存' }))
    expect(screen.getByRole('button', { name: '放弃未保存更改' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '放弃未保存更改' }))
    await act(async () => { resolveRetry?.() })

    expect(screen.getByRole('region', { name: '草稿库' })).toBeInTheDocument()
    expect(put).toHaveBeenCalledTimes(2)
  })
})

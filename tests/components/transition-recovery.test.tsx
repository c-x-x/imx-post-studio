import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { put, list, remove } = vi.hoisted(() => ({ put: vi.fn(), list: vi.fn(), remove: vi.fn() }))
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

vi.mock('../../src/drafts/repository', () => ({
  draftRepository: { put, list, get: vi.fn(), duplicate: vi.fn(), rename: vi.fn(), delete: remove },
}))

vi.mock('../../src/github/origins', () => ({ githubOrigins: { get: vi.fn(), delete: vi.fn(), list: vi.fn().mockResolvedValue(new Map()) } }))

import { App } from '../../src/app/App'
import { exportRecoveryBundle } from '../../src/bundles/recovery-bundle'
import { createArticleDraft } from '../../src/metadata/article'
import { fileFromBlob } from '../helpers/test-files'

async function startWorkspace() {
  fireEvent.click(screen.getByRole('button', { name: '写作' }))
  await act(async () => { await Promise.resolve() })
}

describe('workspace transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    put.mockReset()
    list.mockReset()
    remove.mockReset()
    list.mockResolvedValue([])
    put.mockResolvedValue(undefined)
    remove.mockResolvedValue(undefined)
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('returns home immediately and restores the same in-memory article', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '仍在内存' } })
    put.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '首页' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'IMX Post Studio 介绍' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '写作' }))
    expect(screen.getByLabelText('标题')).toHaveValue('仍在内存')
  })

  it('automatically saves without a manual save button', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '手动保存' } })
    put.mockClear()

    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await act(async () => { await Promise.resolve() })

    expect(put).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ title: '手动保存' }) }))
    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
    expect(screen.getByText('已保存到本地草稿')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存到草稿库' })).not.toBeInTheDocument()
  })

  it('saves a started article before creating a fresh unsaved article', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '上一份文章' } })
    put.mockClear()

    const newArticle = screen.getByRole('button', { name: '新建文章' })
    newArticle.focus()
    fireEvent.click(newArticle)
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('dialog', { name: '新建文章前是否保存？' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存草稿并新建' }))
    await act(async () => { await Promise.resolve() })

    expect(put).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ title: '上一份文章' }) }))
    expect(screen.getByLabelText('标题')).toHaveValue('')
    put.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '首页' }))
    expect(put).not.toHaveBeenCalled()
  })

  it('cancels a new article transition without changing or saving the current article', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '继续写作' } })
    put.mockClear()

    const newArticle = screen.getByRole('button', { name: '新建文章' })
    newArticle.focus()
    fireEvent.click(newArticle)
    expect(screen.getByRole('dialog', { name: '新建文章前是否保存？' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(put).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
    expect(screen.getByLabelText('标题')).toHaveValue('继续写作')
    expect(screen.getByRole('button', { name: '新建文章' })).toHaveFocus()
  })

  it('deletes the stored current draft before creating a new article', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '删除这份草稿' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await act(async () => { await Promise.resolve() })
    const outgoing = put.mock.calls.at(-1)?.[0] as { id: string }
    put.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '新建文章' }))
    act(() => vi.advanceTimersByTime(800))
    expect(put).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '删除草稿并继续' }))
    await act(async () => { await Promise.resolve() })

    expect(remove).toHaveBeenCalledWith(outgoing.id)
    expect(put).not.toHaveBeenCalled()
    expect(screen.getByLabelText('标题')).toHaveValue('')
    expect(screen.getByText('已创建新文章')).toBeInTheDocument()
  })

  it('keeps the current article and decision open when draft deletion fails', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '删除失败也要保留' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await act(async () => { await Promise.resolve() })
    const outgoing = put.mock.calls.at(-1)?.[0] as { id: string }
    remove.mockRejectedValueOnce(new Error('Quota exceeded'))

    fireEvent.click(screen.getByRole('button', { name: '新建文章' }))
    fireEvent.click(screen.getByRole('button', { name: '删除草稿并继续' }))
    await act(async () => { await Promise.resolve() })

    expect(remove).toHaveBeenCalledWith(outgoing.id)
    expect(screen.getByRole('dialog', { name: '新建文章前是否保存？' })).toHaveTextContent('删除草稿失败：Quota exceeded')
    expect(screen.getByLabelText('标题')).toHaveValue('删除失败也要保留')
  })

  it('returns home immediately from the clickable Studio brand without losing the article', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Logo 返回后保留' } })
    put.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'IPS，返回首页' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'IMX Post Studio 介绍' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '写作' }))
    expect(screen.getByLabelText('标题')).toHaveValue('Logo 返回后保留')
  })

  it('keeps the confirmation open when save-before-new fails', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '不能丢失' } })
    put.mockReset()
    put.mockRejectedValueOnce(new Error('Quota exceeded'))

    fireEvent.click(screen.getByRole('button', { name: '新建文章' }))
    fireEvent.click(screen.getByRole('button', { name: '保存草稿并新建' }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('dialog', { name: '新建文章前是否保存？' })).toHaveTextContent('保存草稿失败：Quota exceeded')
    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
    expect(screen.getByLabelText('标题')).toHaveValue('不能丢失')
  })

  it('flushes the latest draft before dashboard navigation can cancel the 800 ms autosave timer', async () => {
    render(<App />)
    await startWorkspace()
    put.mockClear()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '立即保存' } })
    act(() => vi.advanceTimersByTime(799))
    expect(put).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ title: '立即保存' }) }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('region', { name: '草稿' })).toBeInTheDocument()
  })

  it('keeps the workspace and offers explicit recovery/discard actions when a transition flush fails', async () => {
    render(<App />)
    await startWorkspace()
    put.mockReset()
    put.mockRejectedValueOnce(new Error('Quota exceeded'))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '不可丢失' } })
    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
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
    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
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
    fireEvent.click(screen.getByRole('button', { name: '草稿' }))

    const title = screen.getByLabelText('标题')
    expect(title).toBeDisabled()
    fireEvent.change(title, { target: { value: '不能覆盖快照' } })
    expect(put).toHaveBeenLastCalledWith(expect.objectContaining({ meta: expect.objectContaining({ title: '应被保存的版本' }) }))

    await act(async () => { resolvePut?.() })
    expect(screen.getByRole('region', { name: '草稿' })).toBeInTheDocument()
  })

  it('does not let discard race a retry continuation', async () => {
    let resolveRetry: (() => void) | undefined
    put.mockRejectedValueOnce(new Error('Quota exceeded'))
    put.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveRetry = resolve }))
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '需要恢复的文章' } })
    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    await act(async () => { await Promise.resolve() })

    fireEvent.click(screen.getByRole('button', { name: '重试保存' }))
    expect(screen.getByRole('button', { name: '放弃未保存更改' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '放弃未保存更改' }))
    await act(async () => { resolveRetry?.() })

    expect(screen.getByRole('region', { name: '草稿' })).toBeInTheDocument()
    expect(put).toHaveBeenCalledTimes(2)
  })

  it('blocks new, dashboard, and import transitions while delayed cover validation is active', async () => {
    let resolveRead: ((value: ArrayBuffer) => void) | undefined
    const delayed = new File([png], 'cover.png', { type: 'image/png' })
    Object.defineProperty(delayed, 'arrayBuffer', {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve }),
    })
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('选择封面'), { target: { files: [delayed] } })

    expect(screen.getByRole('button', { name: '新建文章' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '草稿' })).toBeDisabled()
    expect(screen.getByLabelText('导入 ZIP')).toBeDisabled()
    await act(async () => { resolveRead?.(png.buffer) })
  })

  it('does not let failed-transition discard continue while body intake is active', async () => {
    let resolveRead: ((value: ArrayBuffer) => void) | undefined
    const delayed = new File([png], 'body.png', { type: 'image/png' })
    Object.defineProperty(delayed, 'arrayBuffer', {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve }),
    })
    put.mockRejectedValueOnce(new Error('Quota exceeded'))
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '未保存文章' } })
    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    await act(async () => { await Promise.resolve() })
    fireEvent.change(screen.getByLabelText('添加正文图片'), { target: { files: [delayed] } })

    expect(screen.getByRole('button', { name: '放弃未保存更改' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '放弃未保存更改' }))
    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
    await act(async () => { resolveRead?.(png.buffer) })
  })

  it.each(['替换当前文章', '作为新草稿打开'])('restores focus to the enabled recovery import control after a delayed %s transition', async (choice) => {
    vi.useRealTimers()
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '导入前文章' } })
    const trigger = screen.getByLabelText('导入紧急恢复 ZIP')
    const recovery = await fileFromBlob(await exportRecoveryBundle(createArticleDraft()), 'recovery.zip')
    fireEvent.change(trigger, { target: { files: [recovery] } })
    await screen.findByRole('dialog', { name: '导入已验证' })

    let resolvePut: (() => void) | undefined
    put.mockImplementation(() => new Promise<void>((resolve) => { resolvePut = resolve }))
    fireEvent.click(screen.getByRole('button', { name: choice }))
    expect(trigger).toBeDisabled()
    await act(async () => { resolvePut?.() })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '导入已验证' })).not.toBeInTheDocument()
      expect(trigger).toBeEnabled()
      expect(trigger).toHaveFocus()
    })
  })
})

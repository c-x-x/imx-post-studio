import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { put, list, remove, rename } = vi.hoisted(() => ({ put: vi.fn(), list: vi.fn(), remove: vi.fn(), rename: vi.fn() }))
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

vi.mock('../../src/drafts/repository', () => ({
  draftRepository: { put, list, get: vi.fn(), duplicate: vi.fn(), rename, delete: remove },
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
    rename.mockReset()
    list.mockResolvedValue([])
    put.mockResolvedValue(undefined)
    remove.mockResolvedValue(undefined)
    rename.mockImplementation(async (_id: string, title: string) => {
      const next = createArticleDraft()
      next.meta.title = title.trim()
      return next
    })
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
    expect(screen.getByRole('region', { name: 'I M P S 介绍' })).toBeInTheDocument()
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

  it('shows an unnamed warning, retains content across navigation and saves after naming', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: '尚未命名的内容' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(put).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('文章未命名，未保存至本地草稿')
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'error')
    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    await act(async () => { await Promise.resolve() })
    expect(put).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '当前写作区有无法自动保存的文章' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回写作区处理' }))
    expect(screen.getByLabelText('摘要')).toHaveValue('尚未命名的内容')
    fireEvent.click(screen.getByRole('button', { name: '新建文章' }))
    fireEvent.click(screen.getByRole('button', { name: '保存草稿并新建' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('dialog')).toHaveTextContent('文章未命名，未保存至本地草稿')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByLabelText('摘要')).toHaveValue('尚未命名的内容')
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '现在有标题' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(put).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('已保存到本地草稿')
  })

  it('shows draft-open recovery choices on the draft page when the current article cannot be saved', async () => {
    const savedDraft = createArticleDraft()
    savedDraft.meta.title = '已有草稿'
    savedDraft.meta.slug = 'saved-draft'
    list.mockResolvedValue([savedDraft])
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: '尚未命名但不能丢失' } })

    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByRole('region', { name: '草稿' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '当前写作区有无法自动保存的文章' })).toHaveTextContent('文章未命名，未保存至本地草稿')
    fireEvent.click(screen.getByRole('button', { name: '继续浏览，暂不打开其他文章' }))

    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    await act(async () => { await Promise.resolve() })

    const dialog = screen.getByRole('dialog', { name: '当前写作区有无法自动保存的文章' })
    expect(dialog).toHaveTextContent('文章未命名，未保存至本地草稿')
    expect(dialog).toHaveTextContent('自动保存失败，因此无法安全打开草稿')
    expect(screen.getByRole('region', { name: '草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '文章工作区' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除当前文章' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放弃未保存更改并继续' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出恢复备份' })).toBeInTheDocument()
  })

  it('reports an unnamed push failure only in the editor status area', async () => {
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '稍后删除标题' } })
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: '保留正文内容以启用推送' } })
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: '推送' }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('status')).toHaveTextContent('推送失败：文章未命名')
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'error')
    expect(screen.queryByText(/打开 GitHub 前保存本地草稿失败/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
    await act(async () => { await Promise.resolve() })

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
    expect(screen.getByRole('status')).toHaveTextContent('已创建新文章')
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'info')
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

    fireEvent.click(screen.getByRole('button', { name: 'I M P S，返回首页' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'I M P S 介绍' })).toBeInTheDocument()
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

  it('opens the draft page and shows recovery choices there when its transition flush fails', async () => {
    render(<App />)
    await startWorkspace()
    put.mockReset()
    put.mockRejectedValueOnce(new Error('Quota exceeded'))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '不可丢失' } })
    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('region', { name: '草稿' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '当前写作区有无法自动保存的文章' })).toHaveTextContent('Quota exceeded')
    expect(screen.getByRole('button', { name: '删除当前文章' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '继续浏览，暂不打开其他文章' })).toBeInTheDocument()
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

  it('does not replace the active article with a stale dashboard snapshot', async () => {
    let firstSnapshot: ReturnType<typeof createArticleDraft> | undefined
    put.mockImplementation(async (next: ReturnType<typeof createArticleDraft>) => {
      firstSnapshot ??= structuredClone(next)
    })
    list.mockImplementation(async () => firstSnapshot ? [firstSnapshot] : [])
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '当前文章' } })
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: '旧摘要' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: '内存中的新摘要' } })

    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: '打开' }))

    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
    expect(screen.getByLabelText('摘要')).toHaveValue('内存中的新摘要')
  })

  it('preserves active in-memory edits when renaming its stale dashboard record', async () => {
    let firstSnapshot: ReturnType<typeof createArticleDraft> | undefined
    put.mockImplementation(async (next: ReturnType<typeof createArticleDraft>) => {
      firstSnapshot ??= structuredClone(next)
    })
    list.mockImplementation(async () => firstSnapshot ? [firstSnapshot] : [])
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '旧名称' } })
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: '旧摘要' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: '不能被覆盖的新摘要' } })
    rename.mockImplementation(async (_id: string, title: string) => ({
      ...firstSnapshot!,
      updatedAt: new Date().toISOString(),
      meta: { ...firstSnapshot!.meta, title: title.trim() },
    }))

    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: '重命名' }))
    fireEvent.change(screen.getByRole('dialog', { name: '重命名草稿' }).querySelector('input')!, { target: { value: '新名称' } })
    fireEvent.click(screen.getByRole('button', { name: '保存名称' }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: '写作' }))

    expect(screen.getByLabelText('标题')).toHaveValue('新名称')
    expect(screen.getByLabelText('摘要')).toHaveValue('不能被覆盖的新摘要')
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

  it('deletes the unsaved article without letting another recovery action race it', async () => {
    let resolveDelete: (() => void) | undefined
    put.mockRejectedValueOnce(new Error('Quota exceeded'))
    remove.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveDelete = resolve }))
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '需要恢复的文章' } })
    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    await act(async () => { await Promise.resolve() })

    fireEvent.click(screen.getByRole('button', { name: '删除当前文章' }))
    expect(screen.getByRole('button', { name: '继续浏览，暂不打开其他文章' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '继续浏览，暂不打开其他文章' }))
    await act(async () => { resolveDelete?.() })

    expect(screen.getByRole('region', { name: '草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '当前写作区有无法自动保存的文章' })).not.toBeInTheDocument()
    expect(remove).toHaveBeenCalledOnce()
    expect(put).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '写作' }))
    expect(screen.getByLabelText('标题')).toHaveValue('')
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
    expect(screen.getByLabelText('导入文章包')).toBeDisabled()
    await act(async () => { resolveRead?.(png.buffer) })
  })

  it('does not expose editor mutation controls behind a draft-page recovery dialog', async () => {
    put.mockRejectedValueOnce(new Error('Quota exceeded'))
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '未保存文章' } })
    fireEvent.click(screen.getByRole('button', { name: '草稿' }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('dialog', { name: '当前写作区有无法自动保存的文章' })).toBeInTheDocument()
    expect(screen.queryByLabelText('添加正文图片')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '草稿' })).toBeInTheDocument()
  })

  it.each(['替换当前文章', '作为新草稿打开'])('restores focus to the enabled recovery import control after a delayed %s transition', async (choice) => {
    vi.useRealTimers()
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '导入前文章' } })
    const trigger = screen.getByLabelText('紧急恢复')
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

  it('closes the import staging dialog and exposes transition recovery when autosave fails', async () => {
    vi.useRealTimers()
    render(<App />)
    await startWorkspace()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '导入前未保存文章' } })
    const recovery = await fileFromBlob(await exportRecoveryBundle(createArticleDraft()), 'recovery.zip')
    fireEvent.change(screen.getByLabelText('紧急恢复'), { target: { files: [recovery] } })
    await screen.findByRole('dialog', { name: '导入已验证' })
    put.mockRejectedValueOnce(new Error('Quota exceeded'))

    fireEvent.click(screen.getByRole('button', { name: '作为新草稿打开' }))

    expect(await screen.findByRole('dialog', { name: '当前写作区有无法自动保存的文章' })).toHaveTextContent('Quota exceeded')
    expect(screen.queryByRole('dialog', { name: '导入已验证' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '文章工作区' })).toBeInTheDocument()
  })
})

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArticleDraft } from '../../src/metadata/article'

const { exportArticleBundle } = vi.hoisted(() => ({ exportArticleBundle: vi.fn() }))
vi.mock('../../src/bundles/export-bundle', () => ({ exportArticleBundle }))

import { BundleActions } from '../../src/bundles/BundleActions'
import { exportRecoveryBundle } from '../../src/bundles/recovery-bundle'
import { fileFromBlob } from '../helpers/test-files'

function draft(): ArticleDraft {
  return {
    id: 'export', createdAt: '2026-08-04T09:00:00+08:00', updatedAt: '2026-08-04T09:00:00+08:00',
    meta: { title: 'Export', slug: 'export', date: '2026-08-04T09:00:00+08:00', draft: false, categories: [], tags: [], description: 'ready', featured: false, toc: true },
    body: '', media: [],
  }
}

describe('BundleActions production choices', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); exportArticleBundle.mockReset() })

  it('forces draft=true for the keep-draft choice even if editor metadata is already false', async () => {
    exportArticleBundle.mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:download'), revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<BundleActions draft={draft()} onReplace={() => undefined} onNew={() => undefined} onStatus={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: '导出文章' }))
    fireEvent.click(screen.getByRole('button', { name: '保留 draft = true' }))
    await Promise.resolve()

    expect(exportArticleBundle).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ draft: true }) }), { production: true, publish: false })
    click.mockRestore()
  })

  it('starts only one export when the action is clicked repeatedly while processing', async () => {
    let finish!: (value: Blob) => void
    exportArticleBundle.mockReturnValue(new Promise<Blob>((resolve) => { finish = resolve }))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:download'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<BundleActions draft={draft()} onReplace={() => undefined} onNew={() => undefined} onStatus={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: '备份草稿' }))
    fireEvent.click(screen.getByRole('button', { name: '备份草稿' }))
    expect(exportArticleBundle).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '备份草稿' })).toBeDisabled()

    finish(new Blob(['zip'], { type: 'application/zip' }))
    await Promise.resolve()
  })

  it('shows production export errors inside the active dialog', async () => {
    exportArticleBundle.mockRejectedValue(new Error('导出校验失败'))
    render(<BundleActions draft={draft()} onReplace={() => undefined} onNew={() => undefined} onStatus={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: '导出文章' }))
    const dialog = screen.getByRole('dialog', { name: '导出 Hugo 文章包' })
    fireEvent.click(within(dialog).getByRole('button', { name: '设为 draft = false' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('导出校验失败')
    expect(within(dialog).getByRole('button', { name: '设为 draft = false' })).toBeEnabled()
  })

  it('shows import transition errors inside the active dialog', async () => {
    const user = userEvent.setup()
    render(<BundleActions draft={draft()} onReplace={() => Promise.reject(new Error('无法替换文章'))} onNew={() => undefined} onStatus={() => undefined} />)
    const recovery = await fileFromBlob(await exportRecoveryBundle(draft()), 'recovery.zip')
    await user.upload(screen.getByLabelText('紧急恢复'), recovery)
    const dialog = await screen.findByRole('dialog', { name: '导入已验证' })
    await user.click(within(dialog).getByRole('button', { name: '替换当前文章' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('无法替换文章')
  })

  it('offers a clearly identified recovery ZIP import through the normal replace/new decision', async () => {
    const user = userEvent.setup()
    const onNew = vi.fn()
    render(<BundleActions draft={draft()} onReplace={() => undefined} onNew={onNew} onStatus={() => undefined} />)

    const recovery = await fileFromBlob(await exportRecoveryBundle(draft()), 'recovery.zip')
    await user.upload(screen.getByLabelText('紧急恢复'), recovery)
    expect(await screen.findByRole('dialog', { name: '导入已验证' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '作为新草稿打开' }))
    expect(onNew).toHaveBeenCalledWith(expect.objectContaining({ id: 'export' }))
  })

  it.each([
    ['替换当前文章', 'onReplace'],
    ['作为新草稿打开', 'onNew'],
  ] as const)('closes successful %s through the dialog focus-return path', async (choice, callback) => {
    const user = userEvent.setup()
    const onReplace = vi.fn().mockResolvedValue(true)
    const onNew = vi.fn().mockResolvedValue(true)
    render(<BundleActions draft={draft()} onReplace={onReplace} onNew={onNew} onStatus={() => undefined} />)

    const trigger = screen.getByLabelText('紧急恢复')
    const recovery = await fileFromBlob(await exportRecoveryBundle(draft()), 'recovery.zip')
    await user.upload(trigger, recovery)
    await screen.findByRole('dialog', { name: '导入已验证' })
    await user.click(screen.getByRole('button', { name: choice }))

    expect(callback === 'onReplace' ? onReplace : onNew).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
  })

  it('closes the validated import dialog so app-level transition recovery is visible', async () => {
    const user = userEvent.setup()
    render(<BundleActions draft={draft()} onReplace={() => false} onNew={() => true} onStatus={() => undefined} />)

    const recovery = await fileFromBlob(await exportRecoveryBundle(draft()), 'recovery.zip')
    await user.upload(screen.getByLabelText('紧急恢复'), recovery)
    await screen.findByRole('dialog', { name: '导入已验证' })
    await user.click(screen.getByRole('button', { name: '替换当前文章' }))

    expect(screen.queryByRole('dialog', { name: '导入已验证' })).not.toBeInTheDocument()
  })
})

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    meta: { title: 'Export', slug: 'export', date: '2026-08-04T09:00:00+08:00', draft: false, categories: [], tags: [], description: 'ready', toc: true },
    body: '', media: [],
  }
}

describe('BundleActions production choices', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

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

  it('keeps the validated import dialog open when its transition reports failure', async () => {
    const user = userEvent.setup()
    render(<BundleActions draft={draft()} onReplace={() => false} onNew={() => true} onStatus={() => undefined} />)

    const recovery = await fileFromBlob(await exportRecoveryBundle(draft()), 'recovery.zip')
    await user.upload(screen.getByLabelText('紧急恢复'), recovery)
    await screen.findByRole('dialog', { name: '导入已验证' })
    await user.click(screen.getByRole('button', { name: '替换当前文章' }))

    expect(screen.getByRole('dialog', { name: '导入已验证' })).toBeInTheDocument()
  })
})

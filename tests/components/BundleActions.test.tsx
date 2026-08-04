import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArticleDraft } from '../../src/metadata/article'

const { exportArticleBundle } = vi.hoisted(() => ({ exportArticleBundle: vi.fn() }))
vi.mock('../../src/bundles/export-bundle', () => ({ exportArticleBundle }))

import { BundleActions } from '../../src/bundles/BundleActions'

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
})

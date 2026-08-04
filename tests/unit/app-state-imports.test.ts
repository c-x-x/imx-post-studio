import { describe, expect, it } from 'vitest'
import { appReducer, createImportedDraft } from '../../src/app/app-state'
import type { ArticleDraft } from '../../src/metadata/article'

function draft(id: string, title: string): ArticleDraft {
  return {
    id, createdAt: '2026-08-04T09:00:00+08:00', updatedAt: '2026-08-04T09:00:00+08:00',
    meta: { title, slug: 'article', date: '2026-08-04T09:00:00+08:00', draft: true, categories: [], tags: [], description: '', toc: true },
    body: title, media: [],
  }
}

describe('import transitions', () => {
  it('replaces imported content while preserving the current draft identity', () => {
    const current = draft('current-id', 'current')
    const imported = draft('imported-id', 'imported')
    const next = appReducer(current, { type: 'replace-import-content', draft: imported })

    expect(next.id).toBe('current-id')
    expect(next.createdAt).toBe(current.createdAt)
    expect(next.meta.title).toBe('imported')
  })

  it('assigns a new identity and timestamps when importing as a new draft', () => {
    const imported = draft('imported-id', 'imported')
    const next = createImportedDraft(imported, new Date('2026-08-05T02:00:00.000Z'))

    expect(next.id).not.toBe('imported-id')
    expect(next.createdAt).toBe('2026-08-05T10:00:00+08:00')
    expect(next.updatedAt).toBe(next.createdAt)
    expect(next.body).toBe('imported')
  })
})

import { describe, expect, it } from 'vitest'
import { appReducer, createImportedDraft } from '../../src/app/app-state'
import type { ArticleDraft } from '../../src/metadata/article'

function draft(id: string, title: string): ArticleDraft {
  return {
    id, createdAt: '2026-08-04T09:00:00+08:00', updatedAt: '2026-08-04T09:00:00+08:00',
    meta: { title, slug: 'article', date: '2026-08-04T09:00:00+08:00', draft: true, categories: [], tags: [], description: '', featured: false, toc: true },
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

  it('commits pasted body and media together without mutating the previous draft', () => {
    const current = draft('current-id', 'current')
    const existing = { id: 'old', name: 'old.png', kind: 'body' as const, mime: 'image/png' as const, blob: new Blob(['old']) }
    const pasted = { id: 'new', name: 'new.png', kind: 'body' as const, mime: 'image/png' as const, blob: new Blob(['new']) }
    current.media = [existing]

    const next = appReducer(current, { type: 'paste-body-media', assets: [pasted], body: 'current\n\n![new](images/new.png)' })

    expect(next.body).toBe('current\n\n![new](images/new.png)')
    expect(next.media.map(({ name }) => name)).toEqual(['old.png', 'new.png'])
    expect(current.body).toBe('current')
    expect(current.media).toEqual([existing])
    expect(next.media[0]).not.toBe(existing)
    expect(next.media[1]).not.toBe(pasted)
  })
})

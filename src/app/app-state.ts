import type { ArticleDraft, ArticleMeta, MediaAsset } from '../metadata/article'

export type AppAction =
  | { type: 'new'; draft: ArticleDraft }
  | { type: 'replace'; draft: ArticleDraft }
  | { type: 'replace-import-content'; draft: ArticleDraft }
  | { type: 'set-meta'; field: keyof ArticleMeta; value: ArticleMeta[keyof ArticleMeta] }
  | { type: 'set-body'; body: string }
  | { type: 'add-media'; asset: MediaAsset }
  | { type: 'add-media-batch'; assets: MediaAsset[] }
  | { type: 'paste-body-media'; assets: MediaAsset[]; body: string }
  | { type: 'replace-cover'; asset: MediaAsset }
  | { type: 'remove-media'; id: string }

export function beijingTimestamp(now = new Date()): string {
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return `${beijingTime.toISOString().slice(0, 19)}+08:00`
}

function cloneDraft(draft: ArticleDraft): ArticleDraft {
  return {
    ...draft,
    meta: {
      ...draft.meta,
      categories: [...draft.meta.categories],
      tags: [...draft.meta.tags],
    },
    media: draft.media.map((asset) => ({ ...asset })),
  }
}

function touched(draft: ArticleDraft): ArticleDraft {
  return { ...cloneDraft(draft), updatedAt: beijingTimestamp() }
}

export function createImportedDraft(draft: ArticleDraft, now = new Date()): ArticleDraft {
  const createdAt = beijingTimestamp(now)
  return { ...cloneDraft(draft), id: crypto.randomUUID(), createdAt, updatedAt: createdAt }
}

export function appReducer(state: ArticleDraft, action: AppAction): ArticleDraft {
  switch (action.type) {
    case 'new':
    case 'replace':
      return touched(action.draft)
    case 'replace-import-content':
      return {
        ...touched(action.draft),
        id: state.id,
        createdAt: state.createdAt,
      }
    case 'set-meta':
      return {
        ...touched(state),
        meta: { ...state.meta, [action.field]: action.value },
      }
    case 'set-body':
      return { ...touched(state), body: action.body }
    case 'add-media':
      return { ...touched(state), media: [...state.media, { ...action.asset }] }
    case 'add-media-batch':
      return { ...touched(state), media: [...state.media, ...action.assets.map((asset) => ({ ...asset }))] }
    case 'paste-body-media': {
      const next = touched(state)
      return {
        ...next,
        body: action.body,
        media: [...next.media, ...action.assets.map((asset) => ({ ...asset }))],
      }
    }
    case 'replace-cover':
      return {
        ...touched(state),
        media: [...state.media.filter((asset) => asset.kind !== 'cover'), { ...action.asset, kind: 'cover' }],
      }
    case 'remove-media':
      return { ...touched(state), media: state.media.filter((asset) => asset.id !== action.id).map((asset) => ({ ...asset })) }
  }
}

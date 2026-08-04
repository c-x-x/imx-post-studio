import type { ArticleDraft, ArticleMeta, MediaAsset } from '../metadata/article'

export type AppAction =
  | { type: 'new'; draft: ArticleDraft }
  | { type: 'replace'; draft: ArticleDraft }
  | { type: 'set-meta'; field: keyof ArticleMeta; value: ArticleMeta[keyof ArticleMeta] }
  | { type: 'set-body'; body: string }
  | { type: 'add-media'; asset: MediaAsset }
  | { type: 'replace-cover'; asset: MediaAsset }
  | { type: 'remove-media'; id: string }

function timestamp(): string {
  const beijingTime = new Date(Date.now() + 8 * 60 * 60 * 1000)
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
  return { ...cloneDraft(draft), updatedAt: timestamp() }
}

export function appReducer(state: ArticleDraft, action: AppAction): ArticleDraft {
  switch (action.type) {
    case 'new':
    case 'replace':
      return touched(action.draft)
    case 'set-meta':
      return {
        ...touched(state),
        meta: { ...state.meta, [action.field]: action.value },
      }
    case 'set-body':
      return { ...touched(state), body: action.body }
    case 'add-media':
      return { ...touched(state), media: [...state.media, { ...action.asset }] }
    case 'replace-cover':
      return {
        ...touched(state),
        media: [...state.media.filter((asset) => asset.kind !== 'cover'), { ...action.asset, kind: 'cover' }],
      }
    case 'remove-media':
      return { ...touched(state), media: state.media.filter((asset) => asset.id !== action.id).map((asset) => ({ ...asset })) }
  }
}

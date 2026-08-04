import { pinyin } from 'pinyin-pro'

const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function suggestSlug(title: string): string {
  return pinyin(title, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
    .join(' ')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function validateSlug(slug: string) {
  return VALID_SLUG.test(slug)
    ? { ok: true as const }
    : { ok: false as const, message: 'Slug 只能包含小写英文、数字和单个连字符' }
}

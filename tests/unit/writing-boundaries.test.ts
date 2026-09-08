import { expect, it, vi } from 'vitest'
import { createArticleDraft } from '../../src/metadata/article'
import { exportArticleBundle } from '../../src/bundles/export-bundle'
import { importArticleBundle } from '../../src/bundles/import-bundle'
import { renderMarkdown } from '../../src/preview/markdown'

it.each(['images/a.png?v=1', 'images/a.png#hero', 'images/%61.png?v=1#hero'])('resolves %s using the canonical media path', async (source) => {
  const resolve = vi.fn(() => 'blob:local-image')
  const result = await renderMarkdown(`![image](${source})`, resolve)
  expect(resolve).toHaveBeenCalledWith('images/a.png')
  expect(result.html).toContain('src="blob:local-image"')
})

it('round-trips unfinished draft metadata without inventing a slug or title', async () => {
  const draft = createArticleDraft()
  draft.body = '需要备份的正文'
  draft.meta.date = ''
  const imported = await importArticleBundle(await exportArticleBundle(draft, { production: false, publish: false }))
  expect(imported.meta).toEqual(draft.meta)
  expect(imported.body).toBe(draft.body)
  expect(imported.id).not.toBe(draft.id)
  await expect(exportArticleBundle(draft, { production: true, publish: true })).rejects.toThrow('标题不能为空')
})

it('rejects missing HTML image dependencies before export', async () => {
  const draft = createArticleDraft()
  draft.meta.title = 'test'
  draft.meta.slug = 'test'
  draft.body = '<img src="images/missing.png">'
  await expect(exportArticleBundle(draft, { production: true, publish: true })).rejects.toThrow('缺少正文图片')
})

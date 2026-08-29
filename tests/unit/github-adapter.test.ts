import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'smol-toml'
import { articleToDraft, gitBlobSha, prepareGithubSave, serializeForGithub, type GithubOrigin } from '../../src/github/article-adapter'

const source = `+++\n# Keep this comment on body-only edits\ntitle = 'Example'\ndate = '2026-08-26T12:00:00+08:00'\ndescription = "Article summary"\ndraft = false\ncustom = 'untouched'\n[params]\nimportant = true\n+++\nOriginal body\n`
const origin: GithubOrigin = { repository: 'owner/blog', path: 'content/posts/example/index.md', ref: 'main', commit: 'a'.repeat(40), source, images: [] }
const repository = { name: 'owner/blog', branch: 'main', contentRoot: 'content/posts' }

afterEach(() => vi.unstubAllGlobals())

describe('GitHub article adapter', () => {
  it('blocks incomplete publications while still allowing old articles to be read', async () => {
    const noSummary = { ...origin, source: source.replace('description = "Article summary"\n', '') }
    const draft = await articleToDraft(noSummary, async () => new Blob())
    expect(draft.meta.description).toBe('')
    await expect(prepareGithubSave(draft, repository, origin.commit, noSummary)).rejects.toThrow(/摘要不能为空/)
    draft.meta.description = ' \n '
    await expect(prepareGithubSave(draft, repository, origin.commit)).rejects.toThrow(/摘要不能为空/)
    draft.meta.description = 'A summary'
    draft.body = ' \n '
    await expect(prepareGithubSave(draft, repository, origin.commit)).rejects.toThrow(/正文不能为空/)
  })
  it('publishes both new and existing hidden articles without mutating local drafts', async () => {
    const hiddenOrigin = { ...origin, source: source.replace('draft = false', 'draft = true') }
    const draft = await articleToDraft(hiddenOrigin, async () => new Blob())
    const created = await prepareGithubSave(draft, repository, origin.commit)
    const updated = await prepareGithubSave(draft, repository, origin.commit, hiddenOrigin)
    expect(parse(created.input.source.split('+++')[1]).draft).toBe(false)
    const header = parse(updated.input.source.split('+++')[1])
    expect(header.draft).toBe(false)
    expect(header.custom).toBe('untouched')
    expect(header.params).toEqual({ important: true })
    expect(draft.meta.draft).toBe(true)
    expect(hiddenOrigin.source).toContain('draft = true')
  })
  it('preserves the exact header, unknown fields and publication state on body-only edits', async () => {
    const draft = await articleToDraft(origin, async () => new Blob())
    expect(draft.meta.draft).toBe(false)
    draft.body = 'Revised body\n'
    expect(serializeForGithub(draft, origin)).toBe(source.replace('Original body', 'Revised body'))
  })
  it('preserves unknown TOML fields when known metadata is edited', async () => {
    const draft = await articleToDraft(origin, async () => new Blob())
    draft.meta.title = 'New title'
    const updated = serializeForGithub(draft, origin)
    const frontmatter = parse(updated.split('+++')[1])
    expect(frontmatter.custom).toBe('untouched')
    expect(frontmatter.params).toEqual({ important: true })
    expect(frontmatter.title).toBe('New title')
    expect(frontmatter.draft).toBe(false)
  })
  it('adds featured to an existing article only when the author enables it', async () => {
    const draft = await articleToDraft(origin, async () => new Blob())
    expect(draft.meta.featured).toBe(false)
    draft.meta.featured = true
    const frontmatter = parse(serializeForGithub(draft, origin).split('+++')[1])
    expect(frontmatter.featured).toBe(true)
    expect(frontmatter.custom).toBe('untouched')
  })
  it('rejects silent directory renaming and missing images', async () => {
    const draft = await articleToDraft(origin, async () => new Blob())
    draft.meta.slug = 'other'
    expect(() => serializeForGithub(draft, origin)).toThrow(/不能直接改名/)
    await expect(articleToDraft({ ...origin, source: source + '\n![missing](images/a.png)' }, async () => new Blob())).rejects.toThrow(/缺失/)
  })
  it('prepares changes without uploading, rejects unchanged content and other repositories', async () => {
    const draft = await articleToDraft(origin, async () => new Blob())
    await expect(prepareGithubSave(draft, repository, origin.commit, origin)).rejects.toThrow(/没有变化/)
    draft.body += 'update'
    const prepared = await prepareGithubSave(draft, repository, origin.commit, origin)
    expect(prepared.input.path).toBe(origin.path)
    expect(prepared.input.commit).toBe(origin.commit)
    expect(prepared.uploads).toEqual([])
    await expect(prepareGithubSave(draft, { ...repository, name: 'other/blog' }, origin.commit, origin)).rejects.toThrow(/另一仓库/)
  })
  it('computes the same Git blob identifier as GitHub', async () => {
    vi.stubGlobal('crypto', webcrypto)
    expect(await gitBlobSha(new Blob(['hello\n']))).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })
})

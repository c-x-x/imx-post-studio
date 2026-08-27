import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'smol-toml'
import { articleToDraft, gitBlobSha, prepareGithubSave, serializeForGithub, type GithubOrigin } from '../../src/github/article-adapter'

const source = `+++\n# Keep this comment on body-only edits\ntitle = 'Example'\ndate = '2026-08-26T12:00:00+08:00'\ndraft = false\ncustom = 'untouched'\n[params]\nimportant = true\n+++\nOriginal body\n`
const origin: GithubOrigin = { repository: 'owner/blog', path: 'content/posts/example/index.md', ref: 'main', commit: 'a'.repeat(40), source, images: [] }
const repository = { name: 'owner/blog', branch: 'main', contentRoot: 'content/posts' }

afterEach(() => vi.unstubAllGlobals())

describe('GitHub article adapter', () => {
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

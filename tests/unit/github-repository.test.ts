import { describe, expect, it, vi } from 'vitest'
import { deleteArticle, saveArticle, uploadImage } from '../../server/github/repository'
import { GithubError, readConfig } from '../../server/github/security'
import type { GithubClient } from '../../server/github/client'
import type { GithubDeleteInput, GithubSaveInput } from '../../src/github/contracts'
import { createPngBuffer } from '../helpers/test-images'

const config = readConfig({ GITHUB_ENABLED: 'true', GITHUB_SITE_ORIGIN: 'https://studio.example.com', GITHUB_REPOSITORY: 'owner/blog', GITHUB_ALLOWED_USER_ID: '123', GITHUB_CLIENT_ID: 'test', GITHUB_CLIENT_SECRET: 'test', GITHUB_SESSION_SECRET: 'a1'.repeat(32) })!
const original = 'a'.repeat(40)
const treeSha = 'b'.repeat(40)
const nextCommit = 'c'.repeat(40)
const nextTree = 'd'.repeat(40)
const input = (): GithubSaveInput => ({ mode: 'direct', create: true, path: 'content/posts/article/index.md', ref: 'main', commit: original, requestId: crypto.randomUUID(),
  source: '+++\ntitle = "Article"\ndate = "2026-08-26T12:00:00+08:00"\ndescription = "Article summary"\ndraft = false\n+++\nHello', images: [] })

function fakeGithub(options: { head?: string; entries?: readonly unknown[]; closed?: boolean; truncated?: boolean } = {}) {
  const refs = new Map<string, string>([['main', options.head || original]])
  const commits = new Map<string, { sha: string; tree: { sha: string }; message: string }>([[original, { sha: original, tree: { sha: treeSha }, message: 'original' }]])
  const pulls: { html_url: string; state: string; merged_at: null; head: { ref: string }; base: { ref: string } }[] = []
  const mock = vi.fn(async (path: string, method = 'GET', body?: unknown) => {
    const data = body as Record<string, string> | undefined
    if (path.includes('/git/ref/heads/')) {
      const name = path.split('/git/ref/heads/')[1]
      const sha = refs.get(name)
      if (!sha) throw new GithubError(404, 'not found')
      return { object: { sha } }
    }
    if (method === 'GET' && path.includes('/git/commits/')) return commits.get(path.split('/').at(-1)!)
    if (method === 'GET' && path.includes('/git/trees/')) return { truncated: options.truncated ?? false, tree: options.entries ?? [] }
    if (method === 'POST' && path.endsWith('/git/trees')) return { sha: nextTree }
    if (method === 'POST' && path.endsWith('/git/commits')) { commits.set(nextCommit, { sha: nextCommit, tree: { sha: nextTree }, message: data!.message }); return { sha: nextCommit } }
    if (method === 'POST' && path.endsWith('/git/refs')) { refs.set(data!.ref.replace('refs/heads/', ''), data!.sha); return {} }
    if (method === 'PATCH' && path.includes('/git/refs/heads/')) { refs.set(path.split('/git/refs/heads/')[1], data!.sha); return {} }
    if (method === 'POST' && path.endsWith('/git/blobs')) return { sha: 'f'.repeat(40) }
    if (method === 'GET' && path.includes('/pulls?')) return pulls
    if (method === 'POST' && path.endsWith('/pulls')) {
      const pr = { html_url: 'https://github.com/owner/blog/pull/1', state: options.closed ? 'closed' : 'open', merged_at: null, head: { ref: data!.head }, base: { ref: 'main' } }
      pulls.push(pr)
      return pr
    }
    throw new Error(`unexpected ${method} ${path}`)
  })
  return { client: mock as GithubClient, mock, refs, pulls }
}

describe('GitHub atomic content writes', () => {
  it('rejects incomplete or unpublished submissions before any GitHub writes', async () => {
    const fake = fakeGithub()
    const request = input()
    for (const [source, message] of [
      [request.source.replace('description = "Article summary"\n', ''), '摘要不能为空'],
      [request.source.replace('Article summary', '   '), '摘要不能为空'],
      [request.source.replace('Hello', ' \n '), '正文不能为空'],
      [request.source.replace('draft = false', 'draft = true'), '必须设为已发布'],
      [request.source.replace('title = "Article"', 'title = ""'), '标题不能为空'],
    ]) {
      await expect(saveArticle(config, fake.client, { ...request, source })).rejects.toMatchObject({ status: 400, message: expect.stringContaining(message) })
    }
    expect(fake.mock).not.toHaveBeenCalled()
  })
  it('pushes only scoped paths to main without force and reuses a retry', async () => {
    const fake = fakeGithub({ entries: [{ path: 'unrelated.txt', mode: '100644', type: 'blob', sha: 'e'.repeat(40) }] })
    const request = input()
    const result = await saveArticle(config, fake.client, request)
    expect(result.ref).toBe('main')
    expect(fake.refs.get('main')).toBe(nextCommit)
    const treeCall = fake.mock.mock.calls.find(([path, method]) => path.endsWith('/git/trees') && method === 'POST')!
    expect(treeCall[2]).toEqual({ base_tree: treeSha, tree: [{ path: request.path, mode: '100644', type: 'blob', content: request.source }] })
    expect(await saveArticle(config, fake.client, request)).toEqual(result)
    expect(fake.mock.mock.calls.filter(([path, method]) => path.endsWith('/git/commits') && method === 'POST')).toHaveLength(1)
    expect(fake.pulls).toHaveLength(0)
    expect(fake.mock.mock.calls.find(([, method]) => method === 'PATCH')?.[2]).toEqual({ sha: nextCommit, force: false })
  })
  it('rejects stale revisions before any write', async () => {
    const fake = fakeGithub({ head: 'e'.repeat(40) })
    await expect(saveArticle(config, fake.client, input())).rejects.toMatchObject({ status: 409 })
    expect(fake.mock.mock.calls.every(([, method]) => !method || method === 'GET')).toBe(true)
  })
  it('does not overwrite an existing article with an unlinked new draft', async () => {
    const fake = fakeGithub({ entries: [{ path: input().path, mode: '100644', type: 'blob', sha: 'e'.repeat(40) }] })
    await expect(saveArticle(config, fake.client, input())).rejects.toThrow(/同名/)
    expect(fake.mock.mock.calls.every(([, method]) => !method || method === 'GET')).toBe(true)
  })
  it('does not allow arbitrary blob SHA injection', async () => {
    const fake = fakeGithub()
    await expect(saveArticle(config, fake.client, { ...input(), images: [{ name: 'image.png', sha: 'f'.repeat(40) }] })).rejects.toThrow(/凭据/)
    expect(fake.mock.mock.calls.every(([, method]) => !method || method === 'GET')).toBe(true)
  })
  it('rejects invalid image bytes before staging a blob', async () => {
    const fake = fakeGithub()
    await expect(uploadImage(config, fake.client, { path: input().path, name: 'image.png', base64: Buffer.from('<script>alert(1)</script>').toString('base64') })).rejects.toThrow()
    expect(fake.mock).not.toHaveBeenCalled()
  })
  it('rejects symlink image directories', async () => {
    const fake = fakeGithub({ entries: [{ path: 'content/posts/article/images', mode: '120000', type: 'blob', sha: 'e'.repeat(40) }] })
    await expect(saveArticle(config, fake.client, input())).rejects.toThrow(/非目录/)
  })
  it('uses validated uploads and deletes only images in the edited bundle', async () => {
    const fake = fakeGithub({ entries: [
      { path: input().path, mode: '100644', type: 'blob', sha: 'e'.repeat(40) },
      { path: 'content/posts/article/images/old.png', mode: '100644', type: 'blob', sha: 'e'.repeat(40) },
      { path: 'content/posts/other/images/keep.png', mode: '100644', type: 'blob', sha: 'e'.repeat(40) },
    ] })
    const upload = await uploadImage(config, fake.client, { path: input().path, name: 'new.png', base64: createPngBuffer(1, 1).toString('base64') })
    await saveArticle(config, fake.client, { ...input(), create: false, images: [{ name: 'new.png', ...upload }] })
    const call = fake.mock.mock.calls.find(([path, method]) => path.endsWith('/git/trees') && method === 'POST')!
    expect(call[2]).toMatchObject({ tree: [
      { path: input().path },
      { path: 'content/posts/article/images/new.png', sha: upload.sha },
      { path: 'content/posts/article/images/old.png', sha: null },
    ] })
  })
  it('rejects legacy PR clients and non-main targets before writes', async () => {
    const fake = fakeGithub()
    await expect(saveArticle(config, fake.client, { ...input(), mode: undefined } as unknown as GithubSaveInput)).rejects.toMatchObject({ status: 400 })
    await expect(saveArticle(config, fake.client, { ...input(), ref: 'ipost/123-' + crypto.randomUUID() })).rejects.toMatchObject({ status: 400 })
    expect(fake.mock).not.toHaveBeenCalled()
  })
  it('preserves concurrent main changes instead of force-pushing', async () => {
    const fake = fakeGithub()
    const client: GithubClient = async (path, method, body) => {
      if (method === 'PATCH') throw new GithubError(422, 'not a fast forward')
      return fake.client(path, method, body)
    }
    await expect(saveArticle(config, client, input())).rejects.toMatchObject({ status: 409 })
    expect(fake.refs.get('main')).toBe(original)
  })

  it('deletes only the selected bundle atomically and safely retries a lost response', async () => {
    const request: GithubDeleteInput = { path: input().path, ref: 'main', commit: original, requestId: crypto.randomUUID() }
    const fake = fakeGithub({ entries: [
      { path: 'content/posts/article', mode: '040000', type: 'tree', sha: treeSha },
      { path: request.path, mode: '100644', type: 'blob', sha: original },
      { path: 'content/posts/article/images/cover.webp', mode: '100644', type: 'blob', sha: original },
      { path: 'content/posts/article/attachment.pdf', mode: '100644', type: 'blob', sha: original },
      { path: 'content/posts/article-other/index.md', mode: '100644', type: 'blob', sha: original },
    ] })
    const result = await deleteArticle(config, fake.client, request)
    expect(result).toEqual({ ref: 'main', commit: nextCommit, url: `https://github.com/owner/blog/commit/${nextCommit}` })
    expect(fake.mock.mock.calls.find(([path, method]) => path.endsWith('/git/trees') && method === 'POST')?.[2]).toEqual({
      base_tree: treeSha, tree: [{ path: 'content/posts/article', mode: '040000', type: 'tree', sha: null }],
    })
    expect(fake.mock.mock.calls.find(([, method]) => method === 'PATCH')?.[2]).toEqual({ sha: nextCommit, force: false })
    expect(await deleteArticle(config, fake.client, request)).toEqual(result)
    expect(fake.mock.mock.calls.filter(([path, method]) => path.endsWith('/git/commits') && method === 'POST')).toHaveLength(1)
    // A different article/base must not be mistaken for the completed delete.
    await expect(deleteArticle(config, fake.client, { ...request, path: 'content/posts/article-other/index.md' })).rejects.toMatchObject({ status: 409 })
  })

  it('rejects invalid delete targets, stale/incomplete snapshots and non-directory ancestors without writes', async () => {
    const request: GithubDeleteInput = { path: input().path, ref: 'main', commit: original, requestId: crypto.randomUUID() }
    const fake = fakeGithub()
    for (const invalid of [{ path: 'content/posts' }, { path: 'content/posts/../index.md' }, { ref: 'other' }, { commit: 'bad' }, { requestId: '' }]) {
      await expect(deleteArticle(config, fake.client, { ...request, ...invalid })).rejects.toMatchObject({ status: 400 })
    }
    expect(fake.mock).not.toHaveBeenCalled()
    const entries = [
      { path: 'content/posts/article', mode: '040000', type: 'tree', sha: treeSha },
      { path: request.path, mode: '100644', type: 'blob', sha: original },
    ]
    for (const [options, status] of [
      [{ head: 'e'.repeat(40) }, 409],
      [{ entries: [] }, 404],
      [{ entries, truncated: true }, 413],
      [{ entries: [...entries, { path: 'content/posts', mode: '120000', type: 'blob', sha: original }] }, 400],
    ] as const) {
      const denied = fakeGithub(options)
      await expect(deleteArticle(config, denied.client, request)).rejects.toMatchObject({ status })
      expect(denied.mock.mock.calls.every(([, method]) => !method || method === 'GET')).toBe(true)
    }
  })

  it('does not delete when the branch changes during confirmation/commit', async () => {
    const fake = fakeGithub({ entries: [
      { path: 'content/posts/article', mode: '040000', type: 'tree', sha: treeSha },
      { path: input().path, mode: '100644', type: 'blob', sha: original },
    ] })
    const client: GithubClient = async (path, method, body) => {
      if (method === 'PATCH') throw new GithubError(422, 'not a fast forward')
      return fake.client(path, method, body)
    }
    await expect(deleteArticle(config, client, input())).rejects.toMatchObject({ status: 409 })
    expect(fake.refs.get('main')).toBe(original)
  })
})

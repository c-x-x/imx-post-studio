import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GithubPanel from '../../src/github/GithubPanel'
import { githubApi, GithubApiError } from '../../src/github/api'
import { githubOrigins } from '../../src/github/origins'
import { draftRepository } from '../../src/drafts/repository'
import { createArticleDraft } from '../../src/metadata/article'

vi.mock('../../src/github/api', async (original) => {
  const actual = await original<typeof import('../../src/github/api')>()
  return { ...actual, githubApi: { session: vi.fn(), list: vi.fn(), article: vi.fn(), image: vi.fn(), save: vi.fn(), logout: vi.fn() } }
})
vi.mock('../../src/github/origins', () => ({ githubOrigins: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } }))
vi.mock('../../src/drafts/repository', () => ({ draftRepository: { put: vi.fn() } }))

const repository = { name: 'owner/blog', branch: 'main', contentRoot: 'content/posts' }
const article = { path: 'content/posts/example/index.md', ref: 'main', commit: 'a'.repeat(40), images: [], source: '+++\ntitle = "Example"\ndate = "2026-08-26T12:00:00+08:00"\ndraft = false\n+++\nOriginal' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(githubApi.session).mockResolvedValue({ configured: true, repository, user: { id: 123, login: 'owner' }, csrf: 'csrf' })
  vi.mocked(githubApi.list).mockResolvedValue({ commit: article.commit, articles: [{ path: article.path, slug: 'example' }] })
})
afterEach(cleanup)

describe('optional GitHub workspace', () => {
  it('does not request repository data when disabled; expired tokens offer login again', async () => {
    vi.mocked(githubApi.session).mockResolvedValueOnce({ configured: false })
    render(<GithubPanel draft={createArticleDraft()} onOpen={vi.fn()} onClose={vi.fn()} returnFocus={() => null} />)
    expect(await screen.findByText('后端尚未启用')).toBeInTheDocument()
    expect(githubApi.list).not.toHaveBeenCalled()
    cleanup()
    vi.mocked(githubApi.list).mockRejectedValueOnce(new GithubApiError(401, '请重新登录'))
    render(<GithubPanel draft={createArticleDraft()} onOpen={vi.fn()} onClose={vi.fn()} returnFocus={() => null} />)
    expect(await screen.findByRole('link', { name: '使用 GitHub 登录' })).toHaveAttribute('href', '/api/github/login')
  })
  it('reads a remote article into a new local draft without remote writes', async () => {
    vi.mocked(githubApi.article).mockResolvedValue(article)
    const onOpen = vi.fn().mockResolvedValue(true)
    render(<GithubPanel draft={createArticleDraft()} onOpen={onOpen} onClose={vi.fn()} returnFocus={() => null} />)
    await userEvent.click(await screen.findByRole('button', { name: '读取并编辑' }))
    await waitFor(() => expect(onOpen).toHaveBeenCalled())
    const draft = onOpen.mock.calls[0][0]
    expect(draft.body).toContain('Original')
    expect(draft.meta.slug).toBe('example')
    expect(draftRepository.put).toHaveBeenCalledWith(draft)
    expect(githubOrigins.set).toHaveBeenCalledWith(draft.id, { ...article, repository: repository.name })
    expect(githubApi.save).not.toHaveBeenCalled()
  })
  it('requires an explicit confirmation before submitting and persists the PR association', async () => {
    const draft = createArticleDraft()
    draft.meta.title = 'Local article'
    draft.meta.slug = 'local-article'
    draft.body = 'Edited content'
    vi.mocked(githubApi.save).mockResolvedValue({ ref: `ipost/123-${crypto.randomUUID()}`, commit: 'b'.repeat(40), pullRequest: 'https://github.com/owner/blog/pull/1' })
    render(<GithubPanel draft={draft} onOpen={vi.fn()} onClose={vi.fn()} returnFocus={() => null} />)
    const prepare = await screen.findByRole('button', { name: '准备提交 PR' })
    await waitFor(() => expect(prepare).toBeEnabled())
    await userEvent.click(prepare)
    const confirm = await screen.findByRole('button', { name: '确认提交到 PR' })
    expect(githubApi.save).not.toHaveBeenCalled()
    await userEvent.click(confirm)
    expect(await screen.findByRole('link', { name: '查看 PR' })).toHaveAttribute('href', 'https://github.com/owner/blog/pull/1')
    expect(githubOrigins.set).toHaveBeenCalledWith(draft.id, expect.objectContaining({ repository: repository.name, source: expect.stringContaining('Edited content') }))
  })
})

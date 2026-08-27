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
vi.mock('../../src/github/origins', () => ({ githubOrigins: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn() } }))
vi.mock('../../src/drafts/repository', () => ({ draftRepository: { put: vi.fn(), get: vi.fn() } }))

const repository = { name: 'owner/blog', branch: 'main', contentRoot: 'content/posts' }
const article = { path: 'content/posts/example/index.md', ref: 'main', commit: 'a'.repeat(40), images: [], source: '+++\ntitle = "Example"\ndate = "2026-08-26T12:00:00+08:00"\ndraft = false\n+++\nOriginal' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(githubOrigins.list).mockResolvedValue(new Map())
  vi.mocked(githubApi.session).mockResolvedValue({ configured: true, repository, user: { id: 123, login: 'owner' }, csrf: 'csrf' })
  vi.mocked(githubApi.list).mockResolvedValue({ commit: article.commit, articles: [{ path: article.path, slug: 'example' }] })
})
afterEach(cleanup)

describe('optional GitHub workspace', () => {
  it('shows missing-summary feedback without offering a push confirmation', async () => {
    const draft = createArticleDraft()
    draft.meta.title = 'Local'
    draft.meta.slug = 'local'
    draft.body = 'Content'
    render(<GithubPanel mode="push" draft={draft} onOpen={vi.fn()} onPushed={vi.fn()} onClose={vi.fn()} returnFocus={() => null} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('摘要不能为空')
    expect(screen.queryByRole('button', { name: '确认推送到 main' })).not.toBeInTheDocument()
    expect(githubApi.save).not.toHaveBeenCalled()
  })
  it('does not request repository data when disabled; expired tokens offer login again', async () => {
    vi.mocked(githubApi.session).mockResolvedValueOnce({ configured: false })
    render(<GithubPanel mode="works" draft={createArticleDraft()} onOpen={vi.fn()} onClose={vi.fn()} returnFocus={() => null} />)
    expect(await screen.findByText('后端尚未启用')).toBeInTheDocument()
    expect(githubApi.list).not.toHaveBeenCalled()
    cleanup()
    vi.mocked(githubApi.list).mockRejectedValueOnce(new GithubApiError(401, '请重新登录'))
    render(<GithubPanel mode="works" draft={createArticleDraft()} onOpen={vi.fn()} onClose={vi.fn()} returnFocus={() => null} />)
    expect(await screen.findByRole('link', { name: '使用 GitHub 登录' })).toHaveAttribute('href', '/api/github/login')
  })
  it('reads a remote article into a new local draft without remote writes', async () => {
    vi.mocked(githubApi.article).mockResolvedValue(article)
    const onOpen = vi.fn().mockResolvedValue(true)
    render(<GithubPanel mode="works" draft={createArticleDraft()} onOpen={onOpen} onClose={vi.fn()} returnFocus={() => null} />)
    await userEvent.click(await screen.findByRole('button', { name: '读取并编辑' }))
    await waitFor(() => expect(onOpen).toHaveBeenCalled())
    const draft = onOpen.mock.calls[0][0]
    expect(draft.body).toContain('Original')
    expect(draft.meta.slug).toBe('example')
    expect(draftRepository.put).toHaveBeenCalledWith(draft)
    expect(githubOrigins.set).toHaveBeenCalledWith(draft.id, { ...article, repository: repository.name })
    expect(githubApi.save).not.toHaveBeenCalled()
  })
  it('confirms direct push without a repository list and retries only failed local cleanup', async () => {
    const draft = createArticleDraft()
    draft.meta.title = 'Local article'
    draft.meta.slug = 'local-article'
    draft.meta.description = 'A short article summary'
    draft.body = 'Edited content'
    const result = { ref: 'main', commit: 'b'.repeat(40), url: 'https://github.com/owner/blog/commit/b' }
    vi.mocked(githubApi.save).mockResolvedValue(result)
    const onPushed = vi.fn().mockRejectedValueOnce(new Error('本地清理失败')).mockResolvedValue(undefined)
    render(<GithubPanel mode="push" draft={draft} onOpen={vi.fn()} onPushed={onPushed} onClose={vi.fn()} returnFocus={() => null} />)
    const confirm = await screen.findByRole('button', { name: '确认推送到 main' })
    await waitFor(() => expect(confirm).toBeEnabled())
    expect(screen.queryByRole('region', { name: 'GitHub 文章列表' })).not.toBeInTheDocument()
    expect(githubApi.save).not.toHaveBeenCalled()
    await userEvent.click(confirm)
    expect(await screen.findByRole('alert')).toHaveTextContent('本地清理失败')
    await userEvent.click(screen.getByRole('button', { name: '完成草稿清理' }))
    await waitFor(() => expect(onPushed).toHaveBeenCalledTimes(2))
    expect(githubApi.save).toHaveBeenCalledTimes(1)
    expect(onPushed).toHaveBeenLastCalledWith(draft.id, result)
  })
  it('resumes an existing pending work without rereading or replacing it', async () => {
    const draft = createArticleDraft()
    draft.body = 'local edits'
    vi.mocked(githubOrigins.list).mockResolvedValue(new Map([[draft.id, { ...article, repository: repository.name }]]))
    vi.mocked(draftRepository.get).mockResolvedValue(draft)
    const onOpen = vi.fn()
    render(<GithubPanel mode="works" draft={createArticleDraft()} onOpen={onOpen} onClose={vi.fn()} returnFocus={() => null} />)
    await userEvent.click(await screen.findByRole('button', { name: '读取并编辑' }))
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(draft))
    expect(githubApi.article).not.toHaveBeenCalled()
    expect(draftRepository.put).not.toHaveBeenCalled()
  })
})

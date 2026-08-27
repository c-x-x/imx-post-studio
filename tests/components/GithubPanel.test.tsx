import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GithubPanel from '../../src/github/GithubPanel'
import { githubApi, GithubApiError } from '../../src/github/api'
import { githubOrigins } from '../../src/github/origins'
import { draftRepository } from '../../src/drafts/repository'
import { createArticleDraft } from '../../src/metadata/article'

vi.mock('../../src/github/api', async (original) => {
  const actual = await original<typeof import('../../src/github/api')>()
  return { ...actual, githubApi: { session: vi.fn(), list: vi.fn(), article: vi.fn(), image: vi.fn(), save: vi.fn(), deleteArticle: vi.fn(), logout: vi.fn() } }
})
vi.mock('../../src/github/origins', () => ({ githubOrigins: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn() } }))
vi.mock('../../src/drafts/repository', () => ({ draftRepository: { put: vi.fn(), get: vi.fn(), delete: vi.fn() } }))

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

  it('warns before deletion, defaults to cancel and restores focus without deleting', async () => {
    render(<GithubPanel mode="works" draft={createArticleDraft()} onOpen={vi.fn()} onClose={vi.fn()} returnFocus={() => null} />)
    const trigger = await screen.findByRole('button', { name: '删除' })
    await waitFor(() => expect(trigger).toBeEnabled())
    await userEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '删除作品？' })
    expect(dialog).toHaveTextContent('owner/blog · main')
    expect(dialog).toHaveTextContent('content/posts/example/')
    expect(dialog).toHaveTextContent('Markdown、封面、正文图片及目录内附件')
    expect(dialog).toHaveTextContent('本地草稿和待提交修改会保留')
    const cancel = within(dialog).getByRole('button', { name: '取消' })
    expect(cancel).toHaveFocus()
    await userEvent.click(cancel)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(screen.getByRole('listitem', { name: 'example' })).toBeInTheDocument()
    expect(githubApi.deleteArticle).not.toHaveBeenCalled()
  })

  it('keeps a failed deletion visible and retries without duplicate requests or deleting local drafts', async () => {
    const result = { ref: 'main', commit: 'b'.repeat(40), url: 'https://github.com/owner/blog/commit/b' }
    let finish: (value: typeof result) => void = () => undefined
    vi.mocked(githubApi.deleteArticle)
      .mockRejectedValueOnce(new GithubApiError(409, '远端已更新，请取消并刷新作品'))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<GithubPanel mode="works" draft={createArticleDraft()} onOpen={vi.fn()} onClose={vi.fn()} returnFocus={() => null} />)
    const trigger = await screen.findByRole('button', { name: '删除' })
    await waitFor(() => expect(trigger).toBeEnabled())
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('button', { name: '确认删除作品' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('远端已更新')
    expect(screen.getByRole('listitem', { name: 'example' })).toBeInTheDocument()
    const firstRequest = vi.mocked(githubApi.deleteArticle).mock.calls[0][0]
    expect(firstRequest).toEqual({ path: article.path, ref: 'main', commit: article.commit, requestId: expect.any(String) })
    expect(githubApi.deleteArticle).toHaveBeenCalledWith(firstRequest, 'csrf')
    await userEvent.dblClick(screen.getByRole('button', { name: '确认删除作品' }))
    expect(screen.getByRole('button', { name: '正在删除…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(githubApi.deleteArticle).toHaveBeenCalledTimes(2)
    expect(githubApi.deleteArticle).toHaveBeenLastCalledWith(firstRequest, 'csrf')
    finish(result)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('listitem', { name: 'example' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('已从 main 删除作品“example”')
    expect(screen.getByRole('region', { name: '作品' })).toHaveFocus()
    expect(draftRepository.delete).not.toHaveBeenCalled()
    expect(githubOrigins.delete).not.toHaveBeenCalled()
    expect(draftRepository.put).not.toHaveBeenCalled()
  })
})

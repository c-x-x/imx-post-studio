import { useEffect, useRef, useState } from 'react'
import { AccessibleDialog, DialogClose } from '../app/AccessibleDialog'
import { hasDraftContent, type ArticleDraft } from '../metadata/article'
import { draftRepository } from '../drafts/repository'
import { articleToDraft, prepareGithubSave, type GithubOrigin, type PreparedGithubSave } from './article-adapter'
import { GithubApiError, githubApi } from './api'
import type { GithubSession } from './contracts'
import { githubOrigins } from './origins'
import './github.css'

interface Props {
  draft: ArticleDraft
  onOpen: (draft: ArticleDraft) => Promise<boolean | void>
  onClose: () => void
  returnFocus: () => HTMLElement | null
}

export default function GithubPanel({ draft, onOpen, onClose, returnFocus }: Props) {
  const [session, setSession] = useState<GithubSession>()
  const [articles, setArticles] = useState<{ path: string; slug: string }[]>([])
  const [commit, setCommit] = useState('')
  const [origin, setOrigin] = useState<GithubOrigin>()
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(true)
  const [prepared, setPrepared] = useState<PreparedGithubSave>()
  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([githubApi.session(), githubOrigins.get(draft.id)]).then(async ([nextSession, nextOrigin]) => {
      if (cancelled) return
      setSession(nextSession)
      setOrigin(nextOrigin)
      const list = nextSession.user ? await githubApi.list() : undefined
      if (cancelled) return
      setArticles(list?.articles ?? [])
      setCommit(list?.commit ?? '')
      if (new URLSearchParams(window.location.search).get('github') === 'error') setError('GitHub 登录未完成，请检查账号、App 权限和回调配置后重新登录')
    }).catch((cause: unknown) => {
      if (!cancelled) {
        if (cause instanceof GithubApiError && cause.status === 401) setSession((current) => current && { ...current, user: undefined, csrf: undefined })
        setError(cause instanceof Error ? cause.message : 'GitHub 连接失败')
      }
    }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [draft.id])

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try { await work() }
    catch (cause) {
      if (cause instanceof GithubApiError && cause.status === 401) setSession((current) => current && { ...current, user: undefined, csrf: undefined })
      setError(cause instanceof Error ? cause.message : '操作失败，本地草稿仍保留')
    }
    finally { busyRef.current = false; setBusy(false) }
  }

  const refresh = () => run(async () => {
    const next = await githubApi.session()
    setSession(next)
    if (next.user) {
      const list = await githubApi.list()
      setArticles(list.articles)
      setCommit(list.commit)
    }
  })

  const openRemote = (path: string) => run(async () => {
    if (!session?.repository) return
    setMessage('正在读取文章和图片…')
    const article = await githubApi.article(path)
    const nextDraft = await articleToDraft(article, (name) => githubApi.image(article, name))
    await draftRepository.put(nextDraft)
    await githubOrigins.set(nextDraft.id, { ...article, repository: session.repository.name })
    if (await onOpen(nextDraft) !== false) onClose()
  })

  const prepare = () => run(async () => {
    if (!session?.repository) return
    const list = await githubApi.list()
    setCommit(list.commit)
    if (!origin && list.articles.some((item) => item.path === `${session.repository!.contentRoot}/${draft.meta.slug}/index.md`)) {
      throw new Error('仓库中已有同名文章，请从列表打开后编辑，不能用未关联的本地草稿覆盖')
    }
    setPrepared(await prepareGithubSave(draft, session.repository, list.commit, origin))
    setMessage('请确认下面的变更；自动保存仍只写入本地，只有确认后才会提交 GitHub。')
  })

  const submit = () => run(async () => {
    if (!prepared || !session?.csrf || !session.repository) return
    const result = await githubApi.save(prepared, session.csrf, setMessage)
    const nextOrigin: GithubOrigin = { repository: session.repository.name, path: prepared.input.path, ref: result.ref, commit: result.commit,
      source: prepared.input.source, images: prepared.input.images.map(({ name, sha }) => ({ name, sha, size: draft.media.find((asset) => asset.name === name)?.blob.size || 0 })), pullRequest: result.pullRequest }
    // Keep the retry request until provenance is safely persisted locally.
    await githubOrigins.set(draft.id, nextOrigin)
    setOrigin(nextOrigin)
    setPrepared(undefined)
    setMessage('已保存到 PR。请到 GitHub 检查并手动合并，博客当前发布版本尚未改变。')
  })

  return <AccessibleDialog title="GitHub 博客" className="confirm-dialog github-dialog" onClose={() => { if (!busy) onClose() }} closeOnEscape={!busy} returnFocus={returnFocus}>
    <p>可选的仓库编辑功能。默认本地保存；只有确认提交时才上传到 GitHub。</p>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {message ? <p className="github-message" role="status">{message}</p> : null}
    {!session && busy ? <p role="status">正在检查连接…</p> : null}
    {session?.configured === false ? <div className="github-note"><h3>后端尚未启用</h3><p>需要先创建仅限本人使用的 GitHub App，并配置服务端环境变量。详见项目的 GitHub 博客配置文档。</p><p>未配置时不会访问 GitHub，也不会影响本地草稿和 ZIP。</p></div> : null}
    {session?.configured && !session.user ? <div className="github-controls"><a className="github-button" href="/api/github/login">使用 GitHub 登录</a><span>仅允许配置的本人账号，登录后也不会自动上传草稿。</span></div> : null}
    {session?.user && session.repository ? <>
      <div className="github-controls"><span>{session.user.login} · {session.repository.name}</span><button type="button" disabled={busy} onClick={() => void run(async () => { const result = await githubApi.logout(session.csrf!); setSession({ ...session, user: undefined, csrf: undefined }); setArticles([]); setPrepared(undefined); setMessage(result.warning || '已退出 GitHub，保留本地草稿'); })}>退出登录</button></div>
      {hasDraftContent(draft) ? <section className="github-current" aria-label="当前文章的 GitHub 操作">
        <h3>当前文章：{draft.meta.title || '未命名文章'}</h3>
        <p>{origin ? `关联：${origin.path} · ${origin.ref}` : '本地文章，尚未关联仓库。提交将新建文章，不覆盖同名目录。'}</p>
        {origin?.pullRequest ? <p><a href={origin.pullRequest} target="_blank" rel="noopener noreferrer">查看 PR</a> · 合并或关闭后，请重新读取主分支文章再继续编辑。</p> : null}
        <div className="github-controls"><button type="button" disabled={busy || Boolean(prepared)} onClick={() => void prepare()}>准备提交 PR</button>
          {origin ? <button type="button" disabled={busy || Boolean(prepared)} onClick={() => void run(async () => { await githubOrigins.delete(draft.id); setOrigin(undefined); setMessage('已取消仓库关联，文章仍保留在本地，未修改远端') })}>取消仓库关联</button> : null}
        </div>
        {prepared ? <div className="github-confirm" aria-label="确认 GitHub 变更">
          <p>目标：{prepared.input.path}</p>
          <p>{prepared.origin?.ref.startsWith('ipost/') ? '更新现有 PR' : `新建分支及 PR → ${session.repository.branch}`}；不会自动合并。</p>
          <p>文章文件 1 个；新增/更新图片 {prepared.uploads.length} 张；删除原有图片 {prepared.deleted.length} 张。</p>
          {prepared.deleted.length ? <p className="field-error">待删除图片：{prepared.deleted.join('、')}（仅在 PR 合并后影响博客）</p> : null}
          <details><summary>查看即将提交的 Markdown</summary><pre>{prepared.input.source}</pre></details>
          <div className="github-controls"><button type="button" disabled={busy} onClick={() => { setPrepared(undefined); setMessage('') }}>取消提交</button><button type="button" disabled={busy} onClick={() => void submit()}>确认提交到 PR</button></div>
        </div> : null}
      </section> : null}
      <section className="github-articles" aria-label="GitHub 文章列表"><h3>仓库文章</h3><p>主分支 {session.repository.branch} · {commit.slice(0, 7)}；按文章目录名搜索。</p>
        <label>查找文章<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="文章目录名" /></label>
        <ul>{articles.filter((item) => item.slug.toLowerCase().includes(query.toLowerCase())).map((article) => <li key={article.path}><span>{article.slug}</span><button type="button" disabled={busy || Boolean(prepared)} onClick={() => void openRemote(article.path)}>读取并编辑</button></li>)}</ul>
        {!articles.length ? <p>未找到符合文章包结构的文章。</p> : null}
        <p className="github-note">读取为新的本地草稿，不覆盖你正在编辑的内容。远端发生变化时会停止提交，不会强制覆盖。</p>
      </section>
    </> : null}
    <div className="dialog-actions"><button type="button" disabled={busy} onClick={() => void refresh()}>刷新连接</button><DialogClose>{(close) => <button type="button" disabled={busy} onClick={close}>返回写作</button>}</DialogClose></div>
  </AccessibleDialog>
}

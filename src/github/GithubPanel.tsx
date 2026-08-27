import { useEffect, useRef, useState } from 'react'
import { AccessibleDialog } from '../app/AccessibleDialog'
import { hasDraftContent, type ArticleDraft } from '../metadata/article'
import { draftRepository } from '../drafts/repository'
import { articleToDraft, prepareGithubSave, type GithubOrigin, type PreparedGithubSave } from './article-adapter'
import { GithubApiError, githubApi } from './api'
import type { GithubSaveResult, GithubSession } from './contracts'
import { githubOrigins } from './origins'
import './github.css'

interface Props {
  mode: 'works' | 'push'
  draft: ArticleDraft
  onOpen: (draft: ArticleDraft) => Promise<boolean | void>
  onClose: () => void
  onPushed?: (id: string, result: GithubSaveResult) => Promise<void>
  returnFocus: () => HTMLElement | null
}

export default function GithubPanel({ mode, draft, onOpen, onClose, onPushed, returnFocus }: Props) {
  const [session, setSession] = useState<GithubSession>()
  const [articles, setArticles] = useState<{ path: string; slug: string }[]>([])
  const [origin, setOrigin] = useState<GithubOrigin>()
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(true)
  const [prepared, setPrepared] = useState<PreparedGithubSave>()
  const [published, setPublished] = useState<GithubSaveResult>()
  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([githubApi.session(), mode === 'push' ? githubOrigins.get(draft.id) : undefined]).then(async ([nextSession, nextOrigin]) => {
      if (cancelled) return
      setSession(nextSession)
      setOrigin(nextOrigin)
      if (nextSession.user) {
        const list = await githubApi.list()
        if (cancelled) return
        if (mode === 'works') setArticles(list.articles)
        else if (hasDraftContent(draft)) {
          if (!nextOrigin && list.articles.some((item) => item.path === `${nextSession.repository!.contentRoot}/${draft.meta.slug}/index.md`)) {
            throw new Error('作品中已有同名文章，请从作品页读取并编辑，不能用本地草稿覆盖')
          }
          const next = await prepareGithubSave(draft, nextSession.repository!, list.commit, nextOrigin)
          if (!cancelled) setPrepared(next)
        }
      }
      if (!cancelled && new URLSearchParams(window.location.search).get('github') === 'error') setError('GitHub 登录未完成，请检查账号、App 权限和回调配置后重新登录')
    }).catch((cause: unknown) => {
      if (!cancelled) {
        if (cause instanceof GithubApiError && cause.status === 401) setSession((current) => current && { ...current, user: undefined, csrf: undefined })
        setError(cause instanceof Error ? cause.message : 'GitHub 连接失败')
      }
    }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [draft, mode])

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try { await work() }
    catch (cause) {
      if (cause instanceof GithubApiError && cause.status === 401) setSession((current) => current && { ...current, user: undefined, csrf: undefined })
      setError(cause instanceof Error ? cause.message : '操作失败，草稿仍保留')
    } finally { busyRef.current = false; setBusy(false) }
  }

  const openRemote = (path: string) => run(async () => {
    if (!session?.repository) return
    for (const [id, linked] of await githubOrigins.list()) {
      if (linked.repository !== session.repository.name || linked.path !== path || linked.ref !== session.repository.branch) continue
      const pending = await draftRepository.get(id)
      if (pending) { await onOpen(pending); return }
    }
    setMessage('正在读取文章和图片…')
    const article = await githubApi.article(path)
    const nextDraft = await articleToDraft(article, (name) => githubApi.image(article, name))
    await githubOrigins.set(nextDraft.id, { ...article, repository: session.repository.name })
    await draftRepository.put(nextDraft)
    await onOpen(nextDraft)
  })

  const submit = () => run(async () => {
    if (!prepared || !session?.csrf || !onPushed) return
    const result = published ?? await githubApi.save(prepared, session.csrf, setMessage)
    setPublished(result)
    setMessage('GitHub 推送成功，正在清理本地草稿…')
    // If local cleanup fails, retry only cleanup, never the remote write.
    await onPushed(draft.id, result)
  })

  const content = <>
    <p>{mode === 'works' ? 'GitHub 主分支中的文章。读取并编辑后进入“草稿 → 待提交作品”，再次推送才会更新仓库。' : '确认后直接推送到主分支，不再创建 PR。成功后移除本地草稿并清空编辑区。'}</p>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {message ? <p className="github-message" role="status">{message}</p> : null}
    {busy && !session ? <p role="status">正在检查连接…</p> : null}
    {session?.configured === false ? <div className="github-note"><h3>后端尚未启用</h3><p>请按 GitHub 配置文档创建仅限本人使用的 App，并配置服务端环境变量。本地草稿和 ZIP 不受影响。</p></div> : null}
    {session?.configured && !session.user ? <div className="github-controls"><a className="github-button" href="/api/github/login">使用 GitHub 登录</a><span>仅允许配置的本人账号；登录不会自动上传草稿。</span></div> : null}
    {session?.user && session.repository ? <>
      <div className="github-controls"><span>{session.user.login} · {session.repository.name} · {session.repository.branch}</span>{mode === 'works' ? <button type="button" disabled={busy} onClick={() => void run(async () => { const result = await githubApi.logout(session.csrf!); setSession({ ...session, user: undefined, csrf: undefined }); setArticles([]); setMessage(result.warning || '已退出 GitHub，保留本地草稿') })}>退出登录</button> : null}</div>
      {mode === 'push' ? <section className="github-current" aria-label="推送当前文章">
        <h3>{draft.meta.title || '未命名文章'}</h3>
        <p>{origin ? `待提交作品：${origin.path}` : '本地草稿：将在仓库中新建文章，不覆盖同名目录。'}</p>
        {prepared ? <div className="github-confirm" aria-label="确认 GitHub 变更">
          <p>目标：{session.repository.branch} · {prepared.input.path}</p>
          <p>文章文件 1 个；新增/更新图片 {prepared.uploads.length} 张；删除原有图片 {prepared.deleted.length} 张。</p>
          {prepared.deleted.length ? <p className="field-error">推送后删除图片：{prepared.deleted.join('、')}</p> : null}
          <p>推送会将文章设为已发布（draft = false），博客部署完成后生效。</p>
          <details><summary>查看 Markdown</summary><pre>{prepared.input.source}</pre></details>
          <button type="button" disabled={busy} onClick={() => void submit()}>{published ? '完成草稿清理' : `确认推送到 ${session.repository.branch}`}</button>
        </div> : !busy && !hasDraftContent(draft) ? <p>文章为空，无需推送。</p> : null}
      </section> : <section className="github-articles" aria-label="GitHub 文章列表">
        <label>查找作品<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="文章目录名" /></label>
        <ul>{articles.filter((item) => item.slug.toLowerCase().includes(query.toLowerCase())).map((article) => <li key={article.path}><span>{article.slug}</span><button type="button" disabled={busy} onClick={() => void openRemote(article.path)}>读取并编辑</button></li>)}</ul>
        {!articles.length ? <p>暂无作品，或仓库中没有支持的文章包。</p> : null}
        <p className="github-note">已有待提交修改时会继续打开本地版本，不会覆盖未推送的内容。远端冲突时停止推送，不强制覆盖。</p>
        <button type="button" disabled={busy} onClick={() => void run(async () => { setArticles((await githubApi.list()).articles); setMessage('作品已刷新') })}>刷新作品</button>
      </section>}
    </> : null}
    {mode === 'push' ? <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>返回写作</button></div> : null}
  </>
  return mode === 'works'
    ? <section className="github-dialog github-works draft-dashboard" aria-label="作品"><h2>作品</h2>{content}</section>
    : <AccessibleDialog title="推送" className="confirm-dialog github-dialog" onClose={() => { if (!busy) onClose() }} closeOnEscape={!busy} returnFocus={returnFocus}>{content}</AccessibleDialog>
}

import { useEffect, useRef, useState } from 'react'
import { AccessibleDialog, DialogClose } from '../app/AccessibleDialog'
import { hasDraftContent, type ArticleDraft } from '../metadata/article'
import { draftRepository } from '../drafts/repository'
import { articleToDraft, prepareGithubSave, type GithubOrigin, type PreparedGithubSave } from './article-adapter'
import { GithubApiError, githubApi } from './api'
import type { GithubDeleteInput, GithubSaveResult, GithubSession } from './contracts'
import { githubOrigins } from './origins'
import { useStudioSettings } from '../app/studio-settings'
import './github.css'

interface Props {
  mode: 'works' | 'push'
  draft: ArticleDraft
  onOpen: (draft: ArticleDraft) => Promise<boolean | void>
  onClose: () => void
  onPushed?: (id: string, result: GithubSaveResult) => Promise<void>
  returnFocus: () => HTMLElement | null
}

function WorksOwner({ login, loading }: { login?: string; loading: boolean }) {
  const [scramble, setScramble] = useState('X7#Q9%')
  useEffect(() => {
    if (!loading || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*'
    const timer = window.setInterval(() => {
      setScramble(Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(''))
    }, 100)
    return () => window.clearInterval(timer)
  }, [loading])

  return <div className="github-library-owner">
    <span aria-live="polite" aria-atomic="true">{loading
      ? <><span className="github-owner-scramble" aria-hidden="true">{scramble}</span><span className="visually-hidden">正在读取 GitHub 用户名</span></>
      : login || '未登录'}</span> · 个人博客工作台
  </div>
}

export default function GithubPanel({ mode, draft, onOpen, onClose, onPushed, returnFocus }: Props) {
  const settings = useStudioSettings()
  const [session, setSession] = useState<GithubSession>()
  const [articles, setArticles] = useState<{ path: string; slug: string }[]>([])
  const [listCommit, setListCommit] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ slug: string; input: GithubDeleteInput }>()
  const [deleteError, setDeleteError] = useState('')
  const [origin, setOrigin] = useState<GithubOrigin>()
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(true)
  const [prepared, setPrepared] = useState<PreparedGithubSave>()
  const [published, setPublished] = useState<GithubSaveResult>()
  const busyRef = useRef(false)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const worksRef = useRef<HTMLElement>(null)
  const visibleArticles = articles.filter((item) => item.slug.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  useEffect(() => {
    let cancelled = false
    void Promise.all([githubApi.session(), mode === 'push' ? githubOrigins.get(draft.id) : undefined]).then(async ([nextSession, nextOrigin]) => {
      if (cancelled) return
      setSession(nextSession)
      setOrigin(nextOrigin)
      if (nextSession.user) {
        const list = await githubApi.list()
        if (cancelled) return
        if (mode === 'works') { setArticles(list.articles); setListCommit(list.commit) }
        else if (hasDraftContent(draft)) {
          if (!nextOrigin && list.articles.some((item) => item.path === `${nextSession.repository!.contentRoot}/${draft.meta.slug}/index.md`)) {
            throw new Error('作品中已有同名文章，请从作品页读取并编辑，不能用本地草稿覆盖')
          }
          const next = await prepareGithubSave(draft, nextSession.repository!, list.commit, nextOrigin, settings.commitMessageTemplate)
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
  }, [draft, mode, settings.commitMessageTemplate])

  const run = async (work: () => Promise<void>, onError = setError) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try { await work() }
    catch (cause) {
      if (cause instanceof GithubApiError && cause.status === 401) setSession((current) => current && { ...current, user: undefined, csrf: undefined })
      onError(cause instanceof Error ? cause.message : '操作失败，草稿仍保留')
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

  const remove = () => run(async () => {
    if (!pendingDelete || !session?.csrf) return
    setDeleteError('')
    const result = await githubApi.deleteArticle(pendingDelete.input, session.csrf)
    setArticles((current) => current.filter((article) => article.path !== pendingDelete.input.path))
    setListCommit(result.commit)
    setMessage(`已从 ${result.ref} 删除作品“${pendingDelete.slug}”。博客重新部署后生效，本地草稿仍保留。`)
    setPendingDelete(undefined)
    worksRef.current?.focus({ preventScroll: true })
  }, setDeleteError)

  const content = <>
    <p>{mode === 'works' ? '你的博客作品都在这里。打开文章继续写作，修改会先保存在本地，再由你推送到博客。' : '确认后直接推送到主分支，不再创建 PR。成功后移除本地草稿并清空编辑区。'}</p>
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
          <p>Commit：<code>{prepared.input.message}</code></p>
          {prepared.deleted.length ? <p className="field-error">推送后删除图片：{prepared.deleted.join('、')}</p> : null}
          <p>推送会将文章设为已发布（draft = false），博客部署完成后生效。</p>
          <details><summary>查看 Markdown</summary><pre>{prepared.input.source}</pre></details>
          <button type="button" disabled={busy} onClick={() => void submit()}>{published ? '完成草稿清理' : `确认推送到 ${session.repository.branch}`}</button>
        </div> : !busy && !hasDraftContent(draft) ? <p>文章为空，无需推送。</p> : null}
      </section> : <section className="github-articles" aria-label="GitHub 文章列表">
        <div className="github-library-heading"><h3>我的作品 <span className="github-count">{articles.length}</span></h3><button type="button" disabled={busy} onClick={() => void run(async () => { const list = await githubApi.list(); setArticles(list.articles); setListCommit(list.commit); setMessage('作品已刷新') })}>{busy ? '正在加载…' : '刷新作品'}</button></div>
        <label>查找作品<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入作品目录名" /></label>
        {query.trim() ? <p role="status">找到 {visibleArticles.length} 篇作品<button className="github-clear-search" type="button" onClick={() => setQuery('')}>清除搜索</button></p> : null}
        <ul>{visibleArticles.map((article) => <li key={article.path} aria-label={article.slug}>
          <div className="github-work-info"><h3>{article.slug}</h3><small>{article.path}</small></div>
          <div className="github-article-actions">
            <button type="button" disabled={busy} onClick={() => void openRemote(article.path)}>读取并编辑</button>
            <button type="button" className="github-danger" disabled={busy || !session.csrf || !listCommit} onClick={(event) => {
              deleteTriggerRef.current = event.currentTarget
              setDeleteError('')
              setPendingDelete({ slug: article.slug, input: { path: article.path, ref: session.repository!.branch, commit: listCommit, requestId: crypto.randomUUID() } })
            }}>删除</button>
          </div>
        </li>)}</ul>
        {!busy && !articles.length ? <div className="github-empty"><h3>开始你的第一篇作品</h3><p>在写作页完成文章并推送后，它就会出现在这里。</p><button type="button" onClick={onClose}>去写作</button></div> : !busy && !visibleArticles.length ? <div className="github-empty"><p>没有找到匹配的作品，试试其他目录名。</p></div> : null}
        <p className="github-note">有未推送的修改时，会优先打开你保存在本地的版本。</p>
      </section>}
    </> : null}
    {mode === 'push' ? <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>返回写作</button></div> : null}
  </>
  return mode === 'works'
    ? <><section ref={worksRef} tabIndex={-1} className="github-dialog github-works draft-dashboard" aria-label="作品"><WorksOwner login={session?.user?.login} loading={!session && busy} /><h2>作品</h2>{content}</section>
      {pendingDelete ? <AccessibleDialog title="删除作品？" className="confirm-dialog github-dialog github-delete-dialog" onClose={() => { if (!busyRef.current) setPendingDelete(undefined) }} closeOnEscape={!busy} returnFocus={() => deleteTriggerRef.current}>
        <p>即将从 <strong>{session?.repository?.name} · {pendingDelete.input.ref}</strong> 删除作品“{pendingDelete.slug}”。</p>
        <p className="github-delete-warning">这会删除整个文章目录，包括 Markdown、封面、正文图片及目录内附件。博客重新部署后，该文章将下线。</p>
        <p>目录：<code>{pendingDelete.input.path.slice(0, -'index.md'.length)}</code></p>
        <p>本地草稿和待提交修改会保留。误删后需通过 GitHub 提交历史恢复。</p>
        {deleteError ? <p className="field-error" role="alert">{deleteError}</p> : null}
        <div className="dialog-actions">
          <DialogClose>{(close) => <button type="button" disabled={busy} onClick={close}>取消</button>}</DialogClose>
          <button type="button" className="github-danger" disabled={busy || !session?.csrf} onClick={() => void remove()}>{busy ? '正在删除…' : '确认删除作品'}</button>
        </div>
      </AccessibleDialog> : null}</>
    : <AccessibleDialog title="推送" className="confirm-dialog github-dialog" onClose={() => { if (!busy) onClose() }} closeOnEscape={!busy} returnFocus={returnFocus}>{content}</AccessibleDialog>
}

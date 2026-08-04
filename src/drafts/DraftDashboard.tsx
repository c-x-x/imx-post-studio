import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArticleDraft } from '../metadata/article'
import { exportArticleBundle } from '../bundles/export-bundle'
import { AccessibleDialog } from '../app/AccessibleDialog'
import { LAST_PORTABLE_EXPORT_KEY } from './backup-keys'
import { shouldShowBackupReminder } from './backup-reminder'
import { draftRepository } from './repository'

interface DraftDashboardProps {
  onOpen: (draft: ArticleDraft) => Promise<void> | void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '草稿操作失败，请重试'
}

function recordNeedsBackup(): boolean {
  try {
    const storage = window.localStorage
    if (!storage) return false
    return shouldShowBackupReminder(storage)
  } catch {
    return false
  }
}

function DraftThumbnail({ draft }: { draft: ArticleDraft }) {
  const cover = draft.media.find((asset) => asset.kind === 'cover')
  const url = useMemo(() => cover ? URL.createObjectURL(cover.blob) : undefined, [cover])
  useEffect(() => {
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [url])
  return url ? <img className="draft-thumbnail" src={url} alt="封面缩略图" /> : <div className="draft-thumbnail draft-thumbnail-empty" aria-label="无封面">无封面</div>
}

export function DraftDashboard({ onOpen }: DraftDashboardProps) {
  const [drafts, setDrafts] = useState<ArticleDraft[]>([])
  const [error, setError] = useState<string>()
  const [pendingDelete, setPendingDelete] = useState<ArticleDraft>()
  const [renameDraft, setRenameDraft] = useState<ArticleDraft>()
  const [renameValue, setRenameValue] = useState('')
  const [needsBackup, setNeedsBackup] = useState(recordNeedsBackup)
  const deleteTrigger = useRef<HTMLButtonElement | null>(null)
  const renameTrigger = useRef<HTMLButtonElement | null>(null)
  const dashboardRef = useRef<HTMLElement>(null)

  const refresh = async () => {
    try {
      setDrafts(await draftRepository.list())
      setError(undefined)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }
  useEffect(() => {
    let mounted = true
    void draftRepository.list().then(
      (next) => { if (mounted) setDrafts(next) },
      (cause: unknown) => { if (mounted) setError(errorMessage(cause)) },
    )
    return () => { mounted = false }
  }, [])

  const downloadDraft = async (draft: ArticleDraft) => {
    try {
      const blob = await exportArticleBundle(draft, { production: false, publish: false })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${draft.meta.slug}-draft.zip`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      try {
        window.localStorage?.setItem(LAST_PORTABLE_EXPORT_KEY, new Date().toISOString())
      } catch {
        // The downloaded ZIP is still a valid backup when the preference cannot persist.
      }
      setNeedsBackup(false)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const closeDelete = () => setPendingDelete(undefined)

  return <section ref={dashboardRef} className="draft-dashboard" aria-label="草稿库" tabIndex={-1}>
    <div className="dashboard-heading"><div><h2>本地草稿</h2><p>草稿和图片仅存于这个浏览器。</p></div></div>
    {needsBackup ? <p className="backup-reminder" role="status">超过 7 天没有导出便携草稿备份。建议下载一个草稿 ZIP。</p> : null}
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {drafts.length === 0 ? <p>还没有已保存的草稿。</p> : <ul className="draft-list">{drafts.map((draft) => <li key={draft.id}><DraftThumbnail draft={draft} /><div><h3>{draft.meta.title || '未命名文章'}</h3><p>{draft.meta.slug || '尚未设置 Slug'} · 修改于 {new Date(draft.updatedAt).toLocaleString('zh-CN')}</p></div><div className="draft-actions"><button type="button" onClick={() => void onOpen(draft)}>打开</button><button type="button" onClick={() => void draftRepository.duplicate(draft.id).then(refresh, (cause: unknown) => setError(errorMessage(cause)))}>复制</button><button ref={renameTrigger} type="button" onClick={(event) => { renameTrigger.current = event.currentTarget; setRenameDraft(draft); setRenameValue(draft.meta.title) }}>重命名</button><button type="button" onClick={() => void downloadDraft(draft)}>导出草稿</button><button ref={deleteTrigger} type="button" onClick={(event) => { deleteTrigger.current = event.currentTarget; setPendingDelete(draft) }}>删除</button></div></li>)}</ul>}
    {pendingDelete ? <AccessibleDialog title="删除草稿？" onClose={closeDelete} returnFocus={() => dashboardRef.current}><p>“{pendingDelete.meta.title || '未命名文章'}”及其图片将从本浏览器移除。</p><div className="dialog-actions"><button type="button" onClick={closeDelete}>取消</button><button type="button" onClick={() => void draftRepository.delete(pendingDelete.id).then(() => { closeDelete(); dashboardRef.current?.focus(); return refresh() }, (cause: unknown) => setError(errorMessage(cause)))}>删除草稿</button></div></AccessibleDialog> : null}
    {renameDraft ? <AccessibleDialog title="重命名草稿" onClose={() => setRenameDraft(undefined)} returnFocus={() => renameTrigger.current}><label htmlFor="rename-draft">标题<input id="rename-draft" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label><div className="dialog-actions"><button type="button" onClick={() => setRenameDraft(undefined)}>取消</button><button type="button" onClick={() => void draftRepository.rename(renameDraft.id, renameValue).then(() => { setRenameDraft(undefined); renameTrigger.current?.focus(); return refresh() }, (cause: unknown) => setError(errorMessage(cause)))}>保存名称</button></div></AccessibleDialog> : null}
  </section>
}

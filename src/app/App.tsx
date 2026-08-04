import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import type { ArticleDraft, MediaAsset } from '../metadata/article'
import { createArticleDraft } from '../metadata/article'
import { MarkdownEditor, type MarkdownEditorHandle } from '../editor/MarkdownEditor'
import { MetadataPanel } from '../metadata/MetadataPanel'
import { MediaPanel } from '../media/MediaPanel'
import { ObjectUrlRegistry } from '../media/object-urls'
import { PreviewFrame } from '../preview/PreviewFrame'
import { renderMarkdown, type RenderedMarkdown } from '../preview/markdown'
import previewCss from '../theme/imx/imx-preview.css?raw'
import { BundleActions } from '../bundles/BundleActions'
import { exportRecoveryBundle } from '../bundles/recovery-bundle'
import { DraftDashboard } from '../drafts/DraftDashboard'
import { draftRepository } from '../drafts/repository'
import { useAutosave } from '../drafts/use-autosave'
import { appReducer, createImportedDraft } from './app-state'
import { Notifications } from './notifications'
import './app.css'

type View = 'dashboard' | 'workspace'
type WorkspaceTab = 'settings' | 'write' | 'preview'

interface FailedTransition {
  label: string
  continue: () => void
  message: string
}

const emptyRendered: RenderedMarkdown = { html: '', toc: [], wordCount: 0, readingMinutes: 0 }

function assetAlt(asset: MediaAsset): string {
  return asset.name.replace(/\.[a-z0-9]+$/i, '').replace(/-/g, ' ')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '本地存储不可用'
}

function downloadRecovery(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'imx-post-studio-recovery.zip'
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function App() {
  const [draft, dispatch] = useReducer(appReducer, undefined, () => createArticleDraft())
  const [view, setView] = useState<View>('dashboard')
  const [tab, setTab] = useState<WorkspaceTab>('settings')
  const [rendered, setRendered] = useState<RenderedMarkdown>(emptyRendered)
  const [notice, setNotice] = useState('')
  const [previewError, setPreviewError] = useState<string>()
  const [recoveryError, setRecoveryError] = useState<string>()
  const [failedTransition, setFailedTransition] = useState<FailedTransition>()
  const [transitioning, setTransitioning] = useState(false)
  const transitionInFlight = useRef(false)
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const urls = useRef(new ObjectUrlRegistry())
  const previousMedia = useRef<MediaAsset[]>([])
  const saveStatus = useAutosave(view === 'workspace' ? draft : null)

  useEffect(() => () => urls.current.dispose(), [])
  useEffect(() => {
    const currentById = new Map(draft.media.map((asset) => [asset.id, asset]))
    for (const asset of previousMedia.current) {
      const current = currentById.get(asset.id)
      if (!current || current.blob !== asset.blob) urls.current.revoke(asset.id)
    }
    previousMedia.current = draft.media
  }, [draft.media])
  useEffect(() => {
    let cancelled = false
    void renderMarkdown(draft.body, (path) => {
      const name = path.slice('images/'.length)
      const asset = draft.media.find((candidate) => candidate.name === name)
      return asset ? urls.current.get(asset) : undefined
    }).then(
      (next) => {
        if (!cancelled) {
          setRendered(next)
          setPreviewError(undefined)
        }
      },
      (cause: unknown) => {
        if (!cancelled) setPreviewError(`预览更新失败：${errorMessage(cause)}`)
      },
    )
    return () => { cancelled = true }
  }, [draft.body, draft.media])

  const requestTransition = async (continueTransition: () => void, label: string): Promise<void> => {
    if (view !== 'workspace') {
      continueTransition()
      return
    }
    if (transitionInFlight.current) return
    transitionInFlight.current = true
    setTransitioning(true)
    try {
      await draftRepository.put(draft)
      setFailedTransition(undefined)
      continueTransition()
    } catch (cause) {
      setFailedTransition({ label, continue: continueTransition, message: errorMessage(cause) })
    } finally {
      transitionInFlight.current = false
      setTransitioning(false)
    }
  }

  const startNew = async () => requestTransition(() => {
    dispatch({ type: 'new', draft: createArticleDraft() })
    setTab('settings')
    setView('workspace')
    setNotice('已创建新文章')
  }, '新建文章')

  const openDraft = async (next: ArticleDraft) => requestTransition(() => {
    dispatch({ type: 'replace', draft: next })
    setTab('settings')
    setView('workspace')
    setNotice('草稿已打开')
  }, '打开草稿')

  const replaceImportedDraft = async (next: ArticleDraft) => requestTransition(() => {
    dispatch({ type: 'replace-import-content', draft: next })
    setTab('settings')
    setView('workspace')
    setNotice('已替换当前草稿内容')
  }, '替换当前文章')

  const openImportedAsNew = async (next: ArticleDraft) => requestTransition(() => {
    dispatch({ type: 'new', draft: createImportedDraft(next) })
    setTab('settings')
    setView('workspace')
    setNotice('已作为新草稿打开')
  }, '作为新草稿打开')

  const showDashboard = async () => requestTransition(() => {
    setView('dashboard')
    setNotice('当前草稿已保存到草稿库')
  }, '打开草稿库')

  const exportRecovery = async () => {
    setRecoveryError(undefined)
    try {
      downloadRecovery(await exportRecoveryBundle(draft))
      setNotice('紧急恢复 ZIP 已下载')
    } catch (cause) {
      setRecoveryError(`紧急备份失败：${errorMessage(cause)}`)
    }
  }

  const status = saveStatus.state === 'saving'
    ? '正在保存…'
    : saveStatus.state === 'saved'
      ? '已保存到本地草稿'
      : notice
  const recoveryNeeded = saveStatus.state === 'failed' || Boolean(failedTransition)
  const alerts: ReactNode[] = []
  if (saveStatus.state === 'failed') alerts.push(<p key="autosave">{saveStatus.message}</p>)
  if (failedTransition) {
    alerts.push(<div key="transition"><p>保存当前草稿失败，未执行“{failedTransition.label}”：{failedTransition.message}</p><div className="recovery-actions"><button type="button" onClick={() => void requestTransition(failedTransition.continue, failedTransition.label)}>重试保存</button><button type="button" onClick={() => { failedTransition.continue(); setFailedTransition(undefined) }}>放弃未保存更改</button></div></div>)
  }
  if (recoveryNeeded) alerts.push(<button key="recovery-export" type="button" onClick={() => void exportRecovery()}>紧急导出恢复备份</button>)
  if (previewError) alerts.push(<p key="preview">{previewError}</p>)
  if (recoveryError) alerts.push(<p key="recovery-error">{recoveryError}</p>)

  return <main className="app-shell">
    <header className="app-header"><div><h1>IMX Post Studio</h1><p>文章和图片仅在此浏览器中处理</p></div><div className="app-header-actions"><button type="button" disabled={transitioning} onClick={() => void startNew()}>新建文章</button><button type="button" disabled={transitioning} onClick={() => void showDashboard()}>草稿库</button></div></header>
    <Notifications status={status} alert={alerts.length > 0 ? <>{alerts}</> : undefined} />
    {view === 'dashboard' ? <DraftDashboard onOpen={openDraft} /> : <section className="workspace" aria-label="文章工作区" aria-busy={transitioning}>
      <nav className="workspace-tabs" role="tablist" aria-label="工作区视图">
        {([['settings', '设置'], ['write', '写作'], ['preview', '预览']] as const).map(([id, label]) => <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="workspace-grid" data-tab={tab}>
        <aside id="panel-settings" className="workspace-panel workspace-inspector" role="tabpanel" aria-labelledby="tab-settings"><MetadataPanel meta={draft.meta} onChange={(field, value) => dispatch({ type: 'set-meta', field, value })} /><MediaPanel media={draft.media} body={draft.body} onAddBatch={(assets) => dispatch({ type: 'add-media-batch', assets })} onReplaceCover={(asset) => dispatch({ type: 'replace-cover', asset })} onRemove={(id) => { urls.current.revoke(id); dispatch({ type: 'remove-media', id }) }} onInsertImage={(asset) => editorRef.current?.insertImage(asset.name, assetAlt(asset))} /><BundleActions draft={draft} onReplace={replaceImportedDraft} onNew={openImportedAsNew} onStatus={setNotice} /></aside>
        <section id="panel-write" className="workspace-panel workspace-editor" role="tabpanel" aria-labelledby="tab-write"><h2 className="visually-hidden">写作</h2><MarkdownEditor ref={editorRef} value={draft.body} onChange={(body) => dispatch({ type: 'set-body', body })} /></section>
        <section id="panel-preview" className="workspace-panel workspace-preview" role="tabpanel" aria-labelledby="tab-preview"><PreviewFrame meta={draft.meta} rendered={rendered} css={previewCss} /></section>
      </div>
    </section>}
  </main>
}

import { useEffect, useReducer, useRef, useState } from 'react'
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
import { DraftDashboard } from '../drafts/DraftDashboard'
import { useAutosave } from '../drafts/use-autosave'
import { appReducer } from './app-state'
import { Notifications } from './notifications'
import './app.css'

type View = 'dashboard' | 'workspace'
type WorkspaceTab = 'settings' | 'write' | 'preview'

const emptyRendered: RenderedMarkdown = { html: '', toc: [], wordCount: 0, readingMinutes: 0 }

function assetAlt(asset: MediaAsset): string {
  return asset.name.replace(/\.[a-z0-9]+$/i, '').replace(/-/g, ' ')
}

export function App() {
  const [draft, dispatch] = useReducer(appReducer, undefined, () => createArticleDraft())
  const [view, setView] = useState<View>('dashboard')
  const [tab, setTab] = useState<WorkspaceTab>('settings')
  const [rendered, setRendered] = useState<RenderedMarkdown>(emptyRendered)
  const [notice, setNotice] = useState('')
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
    }).then((next) => { if (!cancelled) setRendered(next) })
    return () => { cancelled = true }
  }, [draft.body, draft.media])

  const startNew = () => {
    dispatch({ type: 'new', draft: createArticleDraft() })
    setTab('settings')
    setView('workspace')
    setNotice('已创建新文章')
  }
  const openDraft = (next: ArticleDraft) => {
    dispatch({ type: 'replace', draft: next })
    setTab('settings')
    setView('workspace')
    setNotice('草稿已打开')
  }
  const status = saveStatus.state === 'saving'
    ? '正在保存…'
    : saveStatus.state === 'saved'
      ? '已保存到本地草稿'
      : notice

  return <main className="app-shell">
    <header className="app-header"><div><h1>IMX Post Studio</h1><p>文章和图片仅在此浏览器中处理</p></div><div className="app-header-actions"><button type="button" onClick={startNew}>新建文章</button><button type="button" onClick={() => setView('dashboard')}>草稿库</button></div></header>
    <Notifications status={status} />
    {view === 'dashboard' ? <DraftDashboard onOpen={openDraft} /> : <section className="workspace" aria-label="文章工作区">
      <nav className="workspace-tabs" role="tablist" aria-label="工作区视图">
        {([['settings', '设置'], ['write', '写作'], ['preview', '预览']] as const).map(([id, label]) => <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="workspace-grid" data-tab={tab}>
        <aside id="panel-settings" className="workspace-panel workspace-inspector" role="tabpanel" aria-labelledby="tab-settings"><MetadataPanel meta={draft.meta} onChange={(field, value) => dispatch({ type: 'set-meta', field, value })} /><MediaPanel media={draft.media} body={draft.body} onAdd={(asset) => dispatch({ type: 'add-media', asset })} onReplaceCover={(asset) => dispatch({ type: 'replace-cover', asset })} onRemove={(id) => { urls.current.revoke(id); dispatch({ type: 'remove-media', id }) }} onInsertImage={(asset) => editorRef.current?.insertImage(asset.name, assetAlt(asset))} /><BundleActions draft={draft} autosaveFailed={saveStatus.state === 'failed'} onReplace={openDraft} onNew={openDraft} onStatus={setNotice} /></aside>
        <section id="panel-write" className="workspace-panel workspace-editor" role="tabpanel" aria-labelledby="tab-write"><h2 className="visually-hidden">写作</h2><MarkdownEditor ref={editorRef} value={draft.body} onChange={(body) => dispatch({ type: 'set-body', body })} /></section>
        <section id="panel-preview" className="workspace-panel workspace-preview" role="tabpanel" aria-labelledby="tab-preview"><PreviewFrame meta={draft.meta} rendered={rendered} css={previewCss} /></section>
      </div>
    </section>}
  </main>
}

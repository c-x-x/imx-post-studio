import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { ArticleDraft, MediaAsset } from '../metadata/article'
import { createArticleDraft, hasDraftContent } from '../metadata/article'
import { MarkdownEditor, type MarkdownEditorHandle, type PastedImageRequest } from '../editor/MarkdownEditor'
import { OutlinePanel } from '../editor/OutlinePanel'
import { MetadataPanel } from '../metadata/MetadataPanel'
import { MediaPanel } from '../media/MediaPanel'
import { CoverPanel } from '../media/CoverPanel'
import { ObjectUrlRegistry } from '../media/object-urls'
import { prepareBodyMediaBatch } from '../media/intake'
import { mediaAlt } from '../media/names'
import { PreviewFrame } from '../preview/PreviewFrame'
import { renderMarkdown, type RenderedMarkdown } from '../preview/markdown'
import previewCss from '../preview/studio-preview.css?raw'
import { BundleActions } from '../bundles/BundleActions'
import { exportRecoveryBundle } from '../bundles/recovery-bundle'
import { DraftDashboard } from '../drafts/DraftDashboard'
import { HomePage } from '../home/HomePage'
import { draftRepository } from '../drafts/repository'
import { useAutosave } from '../drafts/use-autosave'
import { appReducer, createImportedDraft } from './app-state'
import { AccessibleDialog, DialogClose } from './AccessibleDialog'
import { readActionsCollapsed, writeActionsCollapsed } from './action-rail-preference'
import { ArticleActions } from './ArticleActions'
import { ImxDock } from './ImxDock'
import { Notifications } from './notifications'
import { readSettingsCollapsed, writeSettingsCollapsed } from './sidebar-preference'
import { applyTheme, resolveInitialTheme, writeThemePreference, type AppTheme } from './theme-preference'
import { TransitionConfirmDialog } from './TransitionConfirmDialog'
import { useUnsavedChangesWarning } from './use-unsaved-changes-warning'
import './app.css'

type View = 'home' | 'dashboard' | 'workspace'
type WorkspaceTab = 'settings' | 'write'
type InspectorView = 'settings' | 'outline'

interface FailedTransition {
  id: number
  label: string
  continue: () => void
  message: string
}

const emptyRendered: RenderedMarkdown = { html: '', toc: [], wordCount: 0, readingMinutes: 0 }

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
  const [view, setView] = useState<View>('home')
  const [tab, setTab] = useState<WorkspaceTab>('settings')
  const [inspectorView, setInspectorView] = useState<InspectorView>('settings')
  const [outlineFocusVersion, setOutlineFocusVersion] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [rendered, setRendered] = useState<RenderedMarkdown>(emptyRendered)
  const [notice, setNotice] = useState('')
  const [previewError, setPreviewError] = useState<string>()
  const [editorMediaError, setEditorMediaError] = useState<string>()
  const [recoveryError, setRecoveryError] = useState<string>()
  const [failedTransition, setFailedTransition] = useState<FailedTransition>()
  const [transitioning, setTransitioning] = useState(false)
  const [intakeBusy, setIntakeBusy] = useState(false)
  const [draftStarted, setDraftStartedState] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [importFocusVersion, setImportFocusVersion] = useState(0)
  const [settingsCollapsed, setSettingsCollapsed] = useState(readSettingsCollapsed)
  const [actionsCollapsed, setActionsCollapsed] = useState(readActionsCollapsed)
  const [theme, setTheme] = useState<AppTheme>(resolveInitialTheme)
  const [newArticlePromptOpen, setNewArticlePromptOpen] = useState(false)
  const [newArticlePromptError, setNewArticlePromptError] = useState<string>()
  const transitionInFlight = useRef(false)
  const transitionDecisionInFlight = useRef(false)
  const transitionId = useRef(0)
  const draftRevision = useRef(0)
  const draftRef = useRef(draft)
  const draftStartedRef = useRef(false)
  const intakeBusyRef = useRef(false)
  const intakeSources = useRef({ cover: false, body: false, editor: false })
  const failedTransitionRef = useRef<FailedTransition | undefined>(undefined)
  const importFocusTarget = useRef<(() => HTMLElement | null) | undefined>(undefined)
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const outlineFocusPosition = useRef<number | undefined>(undefined)
  const previewTrigger = useRef<HTMLButtonElement>(null)
  const confirmReturnFocus = useRef<HTMLElement | null>(null)
  const urls = useRef(new ObjectUrlRegistry())
  const resolveEditorMediaUrl = useCallback((asset: MediaAsset) => urls.current.get(asset), [])
  const previousMedia = useRef<MediaAsset[]>([])
  const saveStatus = useAutosave(
    view === 'workspace' && draftStarted && hasUnsavedChanges && !newArticlePromptOpen ? draft : null,
    () => setHasUnsavedChanges(false),
  )

  useUnsavedChangesWarning(hasUnsavedChanges)

  useLayoutEffect(() => { draftRef.current = draft }, [draft])
  useLayoutEffect(() => { applyTheme(theme) }, [theme])
  useLayoutEffect(() => {
    if (tab !== 'write' || outlineFocusPosition.current === undefined) return
    const position = outlineFocusPosition.current
    outlineFocusPosition.current = undefined
    editorRef.current?.focusPosition(position)
  }, [outlineFocusVersion, tab])
  useLayoutEffect(() => {
    if (!importFocusTarget.current || transitioning || intakeBusy) return
    const target = importFocusTarget.current()
    if (!target || !target.isConnected) {
      importFocusTarget.current = undefined
      return
    }
    if (target.matches(':disabled')) return
    target.focus()
    importFocusTarget.current = undefined
  }, [importFocusVersion, transitioning, intakeBusy])
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
    if (!previewOpen) return
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
  }, [draft.body, draft.media, previewOpen])
  useEffect(() => {
    if (!previewOpen) return
    document.body.classList.add('preview-open')
    return () => document.body.classList.remove('preview-open')
  }, [previewOpen])
  const setTransitionFailure = (failure: FailedTransition | undefined) => {
    failedTransitionRef.current = failure
    setFailedTransition(failure)
  }

  const setDraftStarted = (started: boolean) => {
    draftStartedRef.current = started
    setDraftStartedState(started)
  }

  const dispatchDraft = (action: Parameters<typeof appReducer>[1], allowDuringTransition = false) => {
    if (transitionInFlight.current && !allowDuringTransition) return
    draftRevision.current += 1
    setDraftStarted(true)
    setHasUnsavedChanges(true)
    dispatch(action)
  }

  const persistLatestDraft = async () => {
    if (!hasDraftContent(draftRef.current)) {
      setDraftStarted(false)
      setHasUnsavedChanges(false)
      return false
    }
    let savedRevision: number
    do {
      savedRevision = draftRevision.current
      await draftRepository.put(draftRef.current)
    } while (savedRevision !== draftRevision.current)
    setHasUnsavedChanges(false)
    return true
  }

  const requestTransition = async (continueTransition: () => void, label: string): Promise<boolean> => {
    if (view !== 'workspace' || !draftStartedRef.current) {
      continueTransition()
      return true
    }
    if (intakeBusyRef.current) {
      setNotice('正在读取媒体，请完成后再切换文章')
      return false
    }
    if (transitionInFlight.current) return false
    transitionInFlight.current = true
    setTransitioning(true)
    try {
      // Any mutation that somehow reaches the reducer during the asynchronous put
      // increments this revision. In that case persist the newest snapshot before
      // allowing a view or identity change to discard the outgoing reducer value.
      await persistLatestDraft()
      setTransitionFailure(undefined)
      continueTransition()
      return true
    } catch (cause) {
      setTransitionFailure({ id: ++transitionId.current, label, continue: continueTransition, message: errorMessage(cause) })
      return false
    } finally {
      transitionInFlight.current = false
      setTransitioning(false)
    }
  }

  const executeNewArticle = () => {
    dispatchDraft({ type: 'new', draft: createArticleDraft() }, true)
    setDraftStarted(false)
    setHasUnsavedChanges(false)
    setTab('settings')
    setInspectorView('settings')
    setView('workspace')
    setNotice('已创建新文章')
  }

  const startNew = () => {
    if (intakeBusyRef.current) {
      setNotice('正在读取媒体，请完成后再切换文章')
      return
    }
    if (transitionInFlight.current || newArticlePromptOpen) return
    confirmReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setNewArticlePromptError(undefined)
    setNewArticlePromptOpen(true)
  }

  const openDraft = (next: ArticleDraft) => requestTransition(() => {
    dispatchDraft({ type: 'replace', draft: next }, true)
    setDraftStarted(true)
    setHasUnsavedChanges(false)
    setTab('settings')
    setInspectorView('settings')
    setView('workspace')
    setNotice('草稿已打开')
  }, '打开草稿')

  const replaceImportedDraft = (next: ArticleDraft) => requestTransition(() => {
    dispatchDraft({ type: 'replace-import-content', draft: next }, true)
    setDraftStarted(true)
    setTab('settings')
    setInspectorView('settings')
    setView('workspace')
    setNotice('已替换当前草稿内容')
  }, '替换当前文章')

  const openImportedAsNew = (next: ArticleDraft) => requestTransition(() => {
    dispatchDraft({ type: 'new', draft: createImportedDraft(next) }, true)
    setDraftStarted(true)
    setTab('settings')
    setInspectorView('settings')
    setView('workspace')
    setNotice('已作为新草稿打开')
  }, '作为新草稿打开')

  const showDashboard = () => requestTransition(() => {
    setView('dashboard')
    setNotice(draftStartedRef.current ? '当前草稿已保存到草稿库' : '已打开草稿库')
  }, '打开草稿库')

  const showHome = () => {
    setView('home')
    setNotice('已返回首页')
  }

  const showWorkspace = () => {
    setView('workspace')
    setNotice('文章编辑器已打开')
  }

  const changeTheme = (next: AppTheme) => {
    setTheme(next)
    writeThemePreference(next)
  }
  const toggleTheme = () => changeTheme(theme === 'light' ? 'dark' : 'light')

  const saveCurrentDraft = async () => {
    if (transitionInFlight.current || intakeBusyRef.current) return
    transitionInFlight.current = true
    setTransitioning(true)
    setRecoveryError(undefined)
    try {
      const saved = await persistLatestDraft()
      if (!saved) {
        setNotice('文章内容为空，未生成草稿')
        return
      }
      setDraftStarted(true)
      setNotice('已保存到草稿库')
    } catch (cause) {
      setRecoveryError(`保存到草稿库失败：${errorMessage(cause)}`)
    } finally {
      transitionInFlight.current = false
      setTransitioning(false)
    }
  }

  const exportRecovery = async () => {
    if (transitionInFlight.current || intakeBusyRef.current) return
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
    : intakeBusy
      ? '正在读取媒体…'
    : saveStatus.state === 'saved'
      ? '已保存到本地草稿'
      : notice
  const recoveryNeeded = saveStatus.state === 'failed' || Boolean(failedTransition)
  const workspaceLocked = transitioning || intakeBusy
  const openPreview = () => {
    setRendered(emptyRendered)
    setPreviewError(undefined)
    setPreviewOpen(true)
  }
  const closePreview = () => {
    setPreviewOpen(false)
    setRendered(emptyRendered)
    setPreviewError(undefined)
  }
  const retryFailedTransition = () => {
    const failure = failedTransitionRef.current
    if (!failure || transitionDecisionInFlight.current || transitionInFlight.current) return
    transitionDecisionInFlight.current = true
    void requestTransition(failure.continue, failure.label).finally(() => { transitionDecisionInFlight.current = false })
  }
  const discardFailedTransition = () => {
    const failure = failedTransitionRef.current
    if (!failure || transitionDecisionInFlight.current || transitionInFlight.current || intakeBusyRef.current) return
    transitionDecisionInFlight.current = true
    transitionInFlight.current = true
    setTransitioning(true)
    setTransitionFailure(undefined)
    try {
      failure.continue()
    } finally {
      transitionInFlight.current = false
      transitionDecisionInFlight.current = false
      setTransitioning(false)
    }
  }
  const cancelNewArticle = () => {
    if (transitionInFlight.current) return
    setNewArticlePromptOpen(false)
    setNewArticlePromptError(undefined)
  }
  const deleteAndContinueNewArticle = async () => {
    if (!newArticlePromptOpen || transitionInFlight.current || intakeBusyRef.current) return
    transitionInFlight.current = true
    setTransitioning(true)
    setNewArticlePromptError(undefined)
    try {
      await draftRepository.delete(draftRef.current.id)
      setHasUnsavedChanges(false)
      setNewArticlePromptOpen(false)
      executeNewArticle()
    } catch (cause) {
      const detail = errorMessage(cause)
      setNewArticlePromptError(detail.startsWith('删除草稿失败：') ? detail : `删除草稿失败：${detail}`)
    } finally {
      transitionInFlight.current = false
      setTransitioning(false)
    }
  }
  const saveAndContinueNewArticle = async () => {
    if (!newArticlePromptOpen || transitionInFlight.current || intakeBusyRef.current) return
    transitionInFlight.current = true
    setTransitioning(true)
    setNewArticlePromptError(undefined)
    try {
      await persistLatestDraft()
      setDraftStarted(true)
      setNewArticlePromptOpen(false)
      executeNewArticle()
    } catch (cause) {
      setNewArticlePromptError(`保存到草稿库失败：${errorMessage(cause)}`)
    } finally {
      transitionInFlight.current = false
      setTransitioning(false)
    }
  }
  const alerts: ReactNode[] = []
  if (saveStatus.state === 'failed') alerts.push(<p key="autosave">{saveStatus.message}</p>)
  if (failedTransition) {
    alerts.push(<div key="transition"><p>保存当前草稿失败，未执行“{failedTransition.label}”：{failedTransition.message}</p><div className="recovery-actions"><button type="button" disabled={transitioning || intakeBusy} onClick={retryFailedTransition}>重试保存</button><button type="button" disabled={transitioning || intakeBusy} onClick={discardFailedTransition}>放弃未保存更改</button></div></div>)
  }
  if (recoveryNeeded) alerts.push(<button key="recovery-export" type="button" disabled={transitioning || intakeBusy} onClick={() => void exportRecovery()}>紧急导出恢复备份</button>)
  if (previewError) alerts.push(<p key="preview">{previewError}</p>)
  if (editorMediaError) alerts.push(<p key="editor-media">{editorMediaError}</p>)
  if (recoveryError) alerts.push(<p key="recovery-error">{recoveryError}</p>)
  const toggleSettings = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus()
    setSettingsCollapsed((current) => {
      const next = !current
      writeSettingsCollapsed(next)
      return next
    })
  }
  const toggleActions = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus()
    setActionsCollapsed((current) => {
      const next = !current
      writeActionsCollapsed(next)
      return next
    })
  }
  const setIntakeSourceBusy = (source: 'cover' | 'body' | 'editor', busy: boolean) => {
    intakeSources.current[source] = busy
    const next = intakeSources.current.cover || intakeSources.current.body || intakeSources.current.editor
    intakeBusyRef.current = next
    setIntakeBusy(next)
  }

  const focusOutlineHeading = (position: number) => {
    outlineFocusPosition.current = position
    setTab('write')
    setOutlineFocusVersion((current) => current + 1)
  }

  const preparePastedImages = async (request: PastedImageRequest): Promise<MediaAsset[]> => {
    const draftId = draftRef.current.id
    setEditorMediaError(undefined)
    setIntakeSourceBusy('editor', true)
    try {
      const assets = await prepareBodyMediaBatch(
        request.files,
        new Set(['cover.webp', ...draftRef.current.media.map(({ name }) => name)]),
      )
      return draftRef.current.id === draftId ? assets : []
    } catch (cause) {
      if (draftRef.current.id === draftId) setEditorMediaError(errorMessage(cause))
      return []
    } finally {
      setIntakeSourceBusy('editor', false)
    }
  }

  return <main className="app-shell">
    <ImxDock view={view} disabled={workspaceLocked} previewTrigger={previewTrigger} theme={theme} onToggleTheme={toggleTheme} onPreview={openPreview} onHome={() => void showHome()} onArticle={showWorkspace} onDashboard={() => void showDashboard()} />
    <Notifications alert={alerts.length > 0 ? <>{alerts}</> : undefined} />
    {view === 'home' ? <HomePage disabled={workspaceLocked} onArticle={showWorkspace} onDashboard={() => void showDashboard()} /> : view === 'dashboard' ? <DraftDashboard onOpen={openDraft} disabled={workspaceLocked} /> : <section className="workspace" aria-label="文章工作区" aria-busy={workspaceLocked} data-inspector-collapsed={settingsCollapsed} data-actions-collapsed={actionsCollapsed}>
      <nav className="workspace-tabs" role="tablist" aria-label="工作区视图">
        {([['settings', '设置'], ['write', '写作']] as const).map(([id, label]) => <button key={id} id={`tab-${id}`} type="button" disabled={workspaceLocked} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="workspace-grid" data-tab={tab}>
        <aside id="panel-settings" className="workspace-panel workspace-inspector" role="tabpanel" aria-labelledby="tab-settings">
          <nav className="inspector-view-tabs" role="tablist" aria-label="左侧栏视图">
            <button id="inspector-tab-settings" type="button" role="tab" aria-selected={inspectorView === 'settings'} aria-controls="inspector-settings" onClick={() => setInspectorView('settings')}>文章设置</button>
            <button id="inspector-tab-outline" type="button" role="tab" aria-selected={inspectorView === 'outline'} aria-controls="inspector-outline" onClick={() => setInspectorView('outline')}>大纲</button>
          </nav>
          {inspectorView === 'settings'
            ? <div id="inspector-settings" className="inspector-settings-panel" role="tabpanel" aria-labelledby="inspector-tab-settings">
                <MetadataPanel compactHeading disabled={workspaceLocked} meta={draft.meta} onChange={(field, value) => dispatchDraft({ type: 'set-meta', field, value })} />
                <CoverPanel draftId={draft.id} cover={draft.media.find((asset) => asset.kind === 'cover')} disabled={transitioning} onReplace={(asset) => dispatchDraft({ type: 'replace-cover', asset })} onRemove={(id) => { urls.current.revoke(id); dispatchDraft({ type: 'remove-media', id }) }} onIntakeBusyChange={(busy) => setIntakeSourceBusy('cover', busy)} />
              </div>
            : <OutlinePanel markdown={draft.body} onSelect={focusOutlineHeading} />}
        </aside>
        <button className="inspector-toggle" type="button" aria-controls="panel-settings" aria-expanded={!settingsCollapsed} aria-label={settingsCollapsed ? '展开文章设置' : '折叠文章设置'} title={settingsCollapsed ? '展开文章设置' : '折叠文章设置'} onClick={toggleSettings}><span aria-hidden="true">{settingsCollapsed ? '›' : '‹'}</span></button>
        <section id="panel-write" className="workspace-panel workspace-editor" role="tabpanel" aria-labelledby="tab-write"><h2 className="visually-hidden">写作</h2><MarkdownEditor disabled={workspaceLocked} ref={editorRef} value={draft.body} media={draft.media} status={status} preparePastedImages={preparePastedImages} onCommitPastedImages={(assets, body) => dispatchDraft({ type: 'paste-body-media', assets, body })} resolveMediaUrl={resolveEditorMediaUrl} onChange={(body) => {
          if (body === draftRef.current.body) return
          dispatchDraft({ type: 'set-body', body })
        }} /></section>
        <button className="actions-toggle" type="button" aria-controls="panel-actions" aria-expanded={!actionsCollapsed} aria-label={actionsCollapsed ? '展开文章操作' : '折叠文章操作'} title={actionsCollapsed ? '展开文章操作' : '折叠文章操作'} onClick={toggleActions}><span aria-hidden="true">{actionsCollapsed ? '‹' : '›'}</span></button>
        <aside id="panel-actions" className="workspace-actions" aria-label="文章工具">
          <ArticleActions disabled={workspaceLocked} onNew={() => void startNew()} onSave={() => void saveCurrentDraft()} />
          <MediaPanel draftId={draft.id} disabled={transitioning} media={draft.media} body={draft.body} onAddBatch={(assets) => dispatchDraft({ type: 'add-media-batch', assets })} onRemove={(id) => { urls.current.revoke(id); dispatchDraft({ type: 'remove-media', id }) }} onInsertImage={(asset) => editorRef.current?.insertImage(asset.name, mediaAlt(asset.name))} onIntakeBusyChange={(busy) => setIntakeSourceBusy('body', busy)} />
          <BundleActions disabled={workspaceLocked} draft={draft} onReplace={replaceImportedDraft} onNew={openImportedAsNew} onStatus={setNotice} onImportFocusRequest={(target) => { importFocusTarget.current = target; setImportFocusVersion((current) => current + 1) }} />
        </aside>
      </div>
    </section>}
    {newArticlePromptOpen ? <TransitionConfirmDialog busy={transitioning || intakeBusy} error={newArticlePromptError} onCancel={cancelNewArticle} onDiscard={() => void deleteAndContinueNewArticle()} onSave={() => void saveAndContinueNewArticle()} returnFocus={() => confirmReturnFocus.current} /> : null}
    {previewOpen ? <AccessibleDialog title="IMX 文章预览" className="preview-dialog" onClose={closePreview} returnFocus={() => previewTrigger.current}><DialogClose>{(close) => <PreviewFrame meta={draft.meta} rendered={rendered} css={previewCss} theme={theme} onThemeChange={changeTheme} onClose={() => close()} />}</DialogClose></AccessibleDialog> : null}
  </main>
}

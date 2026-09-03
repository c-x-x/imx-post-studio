import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent } from 'react'
import type { ArticleDraft, MediaAsset } from '../metadata/article'
import { createArticleDraft, hasDraftContent, hasDraftTitle, UNTITLED_DRAFT_MESSAGE } from '../metadata/article'
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
import { githubOrigins } from '../github/origins'
import type { GithubSaveResult } from '../github/contracts'
import { appReducer, createImportedDraft } from './app-state'
import { AccessibleDialog, DialogClose } from './AccessibleDialog'
import { readActionsCollapsed, writeActionsCollapsed } from './action-rail-preference'
import { ArticleActions } from './ArticleActions'
import { ImxDock } from './ImxDock'
import { readSettingsCollapsed, writeSettingsCollapsed } from './sidebar-preference'
import { applyTheme, resolveInitialTheme, writeThemePreference, type AppTheme } from './theme-preference'
import { TransitionConfirmDialog } from './TransitionConfirmDialog'
import { useUnsavedChangesWarning } from './use-unsaved-changes-warning'
import { useStudioSettings } from './studio-settings'
import './app.css'

const GithubPanel = lazy(() => import('../github/GithubPanel'))

type View = 'home' | 'dashboard' | 'workspace' | 'works'
type WorkspaceTab = 'settings' | 'write' | 'actions'
type InspectorView = 'settings' | 'outline'

interface FailedTransition {
  id: number
  kind: 'autosave' | 'operation'
  label: string
  continue: () => void | Promise<void>
  message: string
  retainsCurrent: boolean
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
  const studioSettings = useStudioSettings()
  const [githubOpen, setGithubOpen] = useState(false)
  const [pendingWorkId, setPendingWorkId] = useState<string>()
  const githubTrigger = useRef<HTMLElement | null>(null)
  const [draft, dispatch] = useReducer(appReducer, undefined, () => createArticleDraft(new Date(), {
    toc: studioSettings.defaultToc,
    featured: studioSettings.defaultFeatured,
  }))
  const [view, setView] = useState<View>(() => new URLSearchParams(window.location.search).has('github') ? 'works' : 'home')
  const [tab, setTab] = useState<WorkspaceTab>('settings')
  const [inspectorView, setInspectorView] = useState<InspectorView>('settings')
  const [actionsView, setActionsView] = useState<'article' | 'format'>('article')
  const [formatToolbarTarget, setFormatToolbarTarget] = useState<HTMLDivElement | null>(null)
  const [outlineFocusVersion, setOutlineFocusVersion] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [rendered, setRendered] = useState<RenderedMarkdown>(emptyRendered)
  const [notice, setNoticeText] = useState('')
  const [noticeTone, setNoticeTone] = useState<'info' | 'pending' | 'success' | 'error'>('info')
  const [failedTransition, setFailedTransition] = useState<FailedTransition>()
  const [transitionBackupError, setTransitionBackupError] = useState<string>()
  const [transitioning, setTransitioning] = useState(false)
  const [intakeBusy, setIntakeBusy] = useState(false)
  const [draftStarted, setDraftStartedState] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [importFocusVersion, setImportFocusVersion] = useState(0)
  const [settingsCollapsed, setSettingsCollapsed] = useState(readSettingsCollapsed)
  const [actionsCollapsed, setActionsCollapsed] = useState(readActionsCollapsed)
  const [dockHidden, setDockHidden] = useState(false)
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
    draftStarted && hasUnsavedChanges && !newArticlePromptOpen && !githubOpen && !transitioning ? draft : null,
    () => setHasUnsavedChanges(false),
    studioSettings.autosaveDelay,
  )

  const setNotice = useCallback((message: string, tone: 'info' | 'pending' | 'success' | 'error' = 'info') => {
    setNoticeText(message)
    setNoticeTone(tone)
  }, [])

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
        }
      },
      (cause: unknown) => {
        if (!cancelled) {
          setPreviewOpen(false)
          setNotice(`预览失败：${errorMessage(cause)}`, 'error')
        }
      },
    )
    return () => { cancelled = true }
  }, [draft.body, draft.media, previewOpen, setNotice])
  useEffect(() => {
    if (!previewOpen) return
    document.body.classList.add('preview-open')
    return () => document.body.classList.remove('preview-open')
  }, [previewOpen])
  const setTransitionFailure = (failure: FailedTransition | undefined) => {
    failedTransitionRef.current = failure
    setFailedTransition(failure)
    setTransitionBackupError(undefined)
  }

  const setDraftStarted = (started: boolean) => {
    draftStartedRef.current = started
    setDraftStartedState(started)
  }

  const dispatchDraft = (action: Parameters<typeof appReducer>[1], allowDuringTransition = false) => {
    if ((transitionInFlight.current || githubOpen) && !allowDuringTransition) return
    setNotice('')
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
      if (!hasDraftTitle(draftRef.current)) throw new Error(UNTITLED_DRAFT_MESSAGE)
      savedRevision = draftRevision.current
      await draftRepository.put(draftRef.current)
    } while (savedRevision !== draftRevision.current)
    setHasUnsavedChanges(false)
    return true
  }

  const requestTransition = async (continueTransition: () => void | Promise<void>, label: string, retainsCurrent = false): Promise<boolean> => {
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
      if (draftStartedRef.current && hasUnsavedChanges) {
        try {
          await persistLatestDraft()
        } catch (cause) {
          setTransitionFailure({ id: ++transitionId.current, kind: 'autosave', label, continue: continueTransition, message: errorMessage(cause), retainsCurrent })
          // Navigating to a read-only library does not replace the in-memory article,
          // so the failure can be handled visibly on the destination page.
          if (retainsCurrent) await continueTransition()
          return false
        }
      }
      setTransitionFailure(undefined)
      try {
        await continueTransition()
        return true
      } catch (cause) {
        setTransitionFailure({ id: ++transitionId.current, kind: 'operation', label, continue: continueTransition, message: errorMessage(cause), retainsCurrent })
        return false
      }
    } finally {
      transitionInFlight.current = false
      setTransitioning(false)
    }
  }

  const executeNewArticle = (nextView: View = 'workspace') => {
    const next = createArticleDraft(new Date(), {
      toc: studioSettings.defaultToc,
      featured: studioSettings.defaultFeatured,
    })
    draftRef.current = next
    dispatchDraft({ type: 'new', draft: next }, true)
    setPendingWorkId(undefined)
    setDraftStarted(false)
    setHasUnsavedChanges(false)
    setTab('settings')
    setInspectorView('settings')
    setView(nextView)
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

  const openDraft = (next: ArticleDraft) => {
    if (next.id === draftRef.current.id) {
      setView('workspace')
      setNotice('当前文章已在写作区打开')
      return Promise.resolve(true)
    }
    return requestTransition(async () => {
      const origin = await githubOrigins.get(next.id)
      dispatchDraft({ type: 'replace', draft: next }, true)
      setPendingWorkId(origin ? next.id : undefined)
      setDraftStarted(true)
      setHasUnsavedChanges(false)
      setTab('settings')
      setInspectorView('settings')
      setView('workspace')
      setNotice(origin ? '待提交作品已打开' : '草稿已打开')
    }, '打开草稿')
  }

  const replaceImportedDraft = (next: ArticleDraft) => requestTransition(async () => {
    // Imported replacements must not silently overwrite a previously linked repository article.
    if (window.localStorage.getItem('ipost-github-linked') === 'true') {
      await githubOrigins.delete(draftRef.current.id)
    }
    setPendingWorkId(undefined)
    dispatchDraft({ type: 'replace-import-content', draft: next }, true)
    setDraftStarted(true)
    setTab('settings')
    setInspectorView('settings')
    setView('workspace')
    setNotice('已替换当前草稿内容')
  }, '替换当前文章')

  const openImportedAsNew = (next: ArticleDraft) => requestTransition(() => {
    dispatchDraft({ type: 'new', draft: createImportedDraft(next) }, true)
    setPendingWorkId(undefined)
    setDraftStarted(true)
    setTab('settings')
    setInspectorView('settings')
    setView('workspace')
    setNotice('已作为新草稿打开')
  }, '作为新草稿打开')

  const showDashboard = () => requestTransition(() => {
    setView('dashboard')
    setNotice('已打开草稿')
  }, '打开草稿', true)

  const showWorks = () => requestTransition(() => {
    setView('works')
    setNotice('已打开作品')
  }, '打开作品', true)

  const showHome = () => {
    setView('home')
    setNotice('已返回首页')
  }

  const showWorkspace = () => {
    setView('workspace')
    setNotice('文章编辑器已打开')
  }

  const openGithub = async () => {
    if (transitionInFlight.current || intakeBusyRef.current) return
    githubTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    transitionInFlight.current = true
    setTransitioning(true)
    try {
      await persistLatestDraft()
      setGithubOpen(true)
    } catch (cause) {
      const detail = errorMessage(cause)
      setNotice(`推送失败：${detail === UNTITLED_DRAFT_MESSAGE ? '文章未命名' : detail}`, 'error')
    }
    finally { transitionInFlight.current = false; setTransitioning(false) }
  }

  const changeTheme = (next: AppTheme) => {
    setTheme(next)
    writeThemePreference(next)
  }
  const toggleTheme = () => changeTheme(theme === 'light' ? 'dark' : 'light')

  const completePush = async (id: string, result: GithubSaveResult) => {
    await draftRepository.completePush(id, result.commit)
    // A stale provenance record contains no draft and cannot resurrect one.
    await githubOrigins.delete(id).catch(() => undefined)
    if (draftRef.current.id === id) executeNewArticle()
    setGithubOpen(false)
    setNotice(`已推送到 ${result.ref}，可在作品页查看`)
  }

  const exportRecovery = async () => {
    if (transitionInFlight.current || intakeBusyRef.current) return
    setNotice('正在生成紧急恢复 ZIP…', 'pending')
    try {
      downloadRecovery(await exportRecoveryBundle(draft))
      setNotice('紧急恢复 ZIP 已下载', 'success')
    } catch (cause) {
      setNotice(`紧急备份失败：${errorMessage(cause)}`, 'error')
    }
  }

  const exportTransitionRecovery = async () => {
    if (transitionInFlight.current || intakeBusyRef.current) return
    setTransitionBackupError(undefined)
    try {
      downloadRecovery(await exportRecoveryBundle(draftRef.current))
    } catch (cause) {
      setTransitionBackupError(`恢复备份失败：${errorMessage(cause)}`)
    }
  }

  const workspaceLocked = transitioning || intakeBusy || githubOpen
  const openPreview = () => {
    setRendered(emptyRendered)
    setPreviewOpen(true)
  }
  const closePreview = () => {
    setPreviewOpen(false)
    setRendered(emptyRendered)
  }
  const retryFailedTransition = () => {
    const failure = failedTransitionRef.current
    if (!failure || transitionDecisionInFlight.current || transitionInFlight.current) return
    transitionDecisionInFlight.current = true
    void requestTransition(failure.continue, failure.label, failure.retainsCurrent).finally(() => { transitionDecisionInFlight.current = false })
  }
  const deleteFailedTransition = async () => {
    const failure = failedTransitionRef.current
    if (!failure || failure.kind !== 'autosave' || transitionDecisionInFlight.current || transitionInFlight.current || intakeBusyRef.current) return
    const deletedId = draftRef.current.id
    const retainedView = view
    transitionDecisionInFlight.current = true
    transitionInFlight.current = true
    setTransitioning(true)
    try {
      await draftRepository.delete(deletedId)
      await githubOrigins.delete(deletedId)
      setTransitionFailure(undefined)
      executeNewArticle(retainedView)
      if (failure.retainsCurrent) setNotice('当前文章已删除')
      else await failure.continue()
    } catch (cause) {
      const detail = errorMessage(cause)
      setTransitionFailure({ ...failure, id: ++transitionId.current, message: detail.startsWith('删除文章失败：') ? detail : `删除文章失败：${detail}` })
    } finally {
      transitionInFlight.current = false
      transitionDecisionInFlight.current = false
      setTransitioning(false)
    }
  }
  const discardFailedTransition = async () => {
    const failure = failedTransitionRef.current
    if (!failure || transitionDecisionInFlight.current || transitionInFlight.current || intakeBusyRef.current) return
    transitionDecisionInFlight.current = true
    transitionInFlight.current = true
    setTransitioning(true)
    setTransitionFailure(undefined)
    try {
      await failure.continue()
    } catch (cause) {
      setTransitionFailure({ ...failure, id: ++transitionId.current, kind: 'operation', message: errorMessage(cause) })
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
  const returnToWorkspaceAfterTransitionFailure = () => {
    setTransitionFailure(undefined)
    setView('workspace')
    setNotice('请处理当前文章后再继续')
  }
  const deleteAndContinueNewArticle = async () => {
    if (!newArticlePromptOpen || transitionInFlight.current || intakeBusyRef.current) return
    transitionInFlight.current = true
    setTransitioning(true)
    setNewArticlePromptError(undefined)
    try {
      await draftRepository.delete(draftRef.current.id)
      await githubOrigins.delete(draftRef.current.id)
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
      setNewArticlePromptError(`保存草稿失败：${errorMessage(cause)}`)
    } finally {
      transitionInFlight.current = false
      setTransitioning(false)
    }
  }
  const unnamed = hasDraftContent(draft) && !hasDraftTitle(draft)
  const status = saveStatus.state === 'saving'
    ? '正在保存…'
    : intakeBusy
      ? '正在读取媒体…'
      : saveStatus.state === 'failed'
          ? `保存失败：${saveStatus.message}`
          : notice
            ? notice
            : unnamed
              ? UNTITLED_DRAFT_MESSAGE
              : saveStatus.state === 'saved' && draftStarted
                ? pendingWorkId === draft.id ? '已保存到待提交作品' : '已保存到本地草稿'
                : '可以开始写作'
  const statusTone = saveStatus.state === 'saving' || intakeBusy ? 'pending'
    : saveStatus.state === 'failed' ? 'error'
      : notice ? noticeTone
        : unnamed ? 'error'
          : saveStatus.state === 'saved' && draftStarted ? 'success' : 'info'
  const toggleDock = () => {
    setDockHidden((hidden) => {
      const next = !hidden
      setNotice(next ? 'Dock已隐藏' : 'Dock已恢复')
      return next
    })
  }
  const statusActions = <>
    <button
      className="editor-dock-toggle"
      type="button"
      disabled={transitioning || intakeBusy}
      aria-label={dockHidden ? '恢复 Dock' : '隐藏 Dock'}
      aria-controls="studio-dock"
      aria-expanded={!dockHidden}
      title={dockHidden ? '恢复 Dock' : '隐藏 Dock，增大写作区'}
      onClick={toggleDock}
    ><span aria-hidden="true" /></button>
    {saveStatus.state === 'failed' ? <button type="button" disabled={transitioning || intakeBusy} onClick={() => void exportRecovery()}>导出恢复备份</button> : null}
  </>
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
    setNotice('正在读取粘贴图片…', 'pending')
    setIntakeSourceBusy('editor', true)
    try {
      const assets = await prepareBodyMediaBatch(
        request.files,
        new Set(['cover.webp', ...draftRef.current.media.map(({ name }) => name)]),
      )
      return draftRef.current.id === draftId ? assets : []
    } catch (cause) {
      if (draftRef.current.id === draftId) setNotice(`图片处理失败：${errorMessage(cause)}`, 'error')
      return []
    } finally {
      setIntakeSourceBusy('editor', false)
    }
  }

  const syncRenamedDraft = (renamed: ArticleDraft) => {
    if (draftRef.current.id !== renamed.id) return
    const current = draftRef.current
    const next = {
      ...current,
      storageRevision: renamed.storageRevision,
      updatedAt: renamed.updatedAt,
      meta: { ...current.meta, title: renamed.meta.title },
    }
    draftRef.current = next
    dispatchDraft({ type: 'replace', draft: next }, true)
    setNotice('草稿名称已更新')
  }

  return <main className="app-shell" data-view={view} data-dock-hidden={view === 'workspace' && dockHidden || undefined}>
    <ImxDock hidden={view === 'workspace' && dockHidden} view={view} disabled={workspaceLocked} theme={theme} onToggleTheme={toggleTheme} onHome={() => void showHome()} onArticle={showWorkspace} onDashboard={() => void showDashboard()} onWorks={() => void showWorks()} />
    {view === 'home' ? <HomePage disabled={workspaceLocked} onArticle={showWorkspace} onDashboard={() => void showDashboard()} onGithub={() => void showWorks()} /> : view === 'dashboard' ? <DraftDashboard activeDraftId={draft.id} onOpen={openDraft} onRename={syncRenamedDraft} disabled={workspaceLocked} onDelete={(id) => { if (draftRef.current.id === id) { executeNewArticle(); setView('dashboard') } }} /> : view === 'works' ? <Suspense fallback={<p role="status">正在加载作品…</p>}><GithubPanel mode="works" draft={draft} onOpen={openDraft} onClose={showWorkspace} returnFocus={() => null} /></Suspense> : <section className="workspace" aria-label="文章工作区" aria-busy={workspaceLocked} data-inspector-collapsed={settingsCollapsed} data-actions-collapsed={actionsCollapsed}>
      <nav className="workspace-tabs" data-editor-controls role="tablist" aria-label="工作区视图">
        {([['settings', '设置'], ['write', '写作'], ['actions', '工具']] as const).map(([id, label]) => <button key={id} id={`tab-${id}`} type="button" disabled={workspaceLocked} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="workspace-grid" data-tab={tab}>
        <aside id="panel-settings" className="workspace-panel workspace-inspector" role="tabpanel" aria-labelledby="tab-settings">
          <nav className="inspector-view-tabs" role="tablist" aria-label="左侧栏视图">
            <button id="inspector-tab-settings" type="button" role="tab" aria-selected={inspectorView === 'settings'} aria-controls="inspector-settings" onClick={() => setInspectorView('settings')}>属性</button>
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
        <section id="panel-write" className="workspace-panel workspace-editor" role="tabpanel" aria-labelledby="tab-write"><h2 className="visually-hidden">写作</h2><MarkdownEditor key={draft.id} initialMode={studioSettings.defaultEditorMode} font={studioSettings.editorFont} focusMode={studioSettings.focusMode} typewriterMode={studioSettings.typewriterMode} disabled={workspaceLocked} ref={editorRef} value={draft.body} media={draft.media} status={status} statusTone={statusTone} statusActions={statusActions} toolbarTarget={formatToolbarTarget} onFormatApplied={() => setTab('write')} preparePastedImages={preparePastedImages} onCommitPastedImages={(assets, body) => dispatchDraft({ type: 'paste-body-media', assets, body })} resolveMediaUrl={resolveEditorMediaUrl} onChange={(body) => {
          if (draft.id !== draftRef.current.id) return
          if (body === draftRef.current.body) return
          dispatchDraft({ type: 'set-body', body })
        }} /></section>
        <button className="actions-toggle" type="button" aria-controls="panel-actions" aria-expanded={!actionsCollapsed} aria-label={actionsCollapsed ? '展开文章操作' : '折叠文章操作'} title={actionsCollapsed ? '展开文章操作' : '折叠文章操作'} onClick={toggleActions}><span aria-hidden="true">{actionsCollapsed ? '‹' : '›'}</span></button>
        <aside id="panel-actions" className="workspace-actions" aria-label="文章工具">
          <nav className="inspector-view-tabs" data-editor-controls role="tablist" aria-label="右侧栏视图">
            <button id="actions-tab-article" type="button" role="tab" aria-selected={actionsView === 'article'} aria-controls="actions-article" onClick={() => setActionsView('article')}>文档</button>
            <button id="actions-tab-format" type="button" role="tab" aria-selected={actionsView === 'format'} aria-controls="actions-format" onClick={() => setActionsView('format')}>排版</button>
          </nav>
          <div id="actions-article" className="actions-article-panel" role="tabpanel" aria-labelledby="actions-tab-article" hidden={actionsView !== 'article'}>
          <div className="article-actions"><button ref={previewTrigger} className="article-save" type="button" disabled={workspaceLocked} onClick={openPreview}>预览文章</button></div>
          <section className="sidebar-tool-group" aria-label="文档操作">
          <h3>文档操作</h3>
          <ArticleActions disabled={workspaceLocked} onNew={() => void startNew()} />
          <div className="article-actions github-entry"><button type="button" disabled={workspaceLocked || !hasDraftContent(draft)} onClick={() => void openGithub()}>推送</button></div>
          <p className="sidebar-tool-hint">自动保存到本地；推送将更新 GitHub 博客。</p>
          </section>
          <BundleActions disabled={workspaceLocked} draft={draft} onReplace={replaceImportedDraft} onNew={openImportedAsNew} onStatus={setNotice} onImportFocusRequest={(target) => { importFocusTarget.current = target; setImportFocusVersion((current) => current + 1) }} />
          <MediaPanel draftId={draft.id} disabled={transitioning} media={draft.media} body={draft.body} onAddBatch={(assets) => dispatchDraft({ type: 'add-media-batch', assets })} onRemove={(id) => { urls.current.revoke(id); dispatchDraft({ type: 'remove-media', id }) }} onInsertImage={(asset) => { editorRef.current?.insertImage(asset.name, mediaAlt(asset.name)); setTab('write') }} onIntakeBusyChange={(busy) => setIntakeSourceBusy('body', busy)} />
          </div>
          <div id="actions-format" className="actions-format-panel" role="tabpanel" aria-labelledby="actions-tab-format" hidden={actionsView !== 'format'}>
          <div ref={setFormatToolbarTarget} />
          </div>
        </aside>
      </div>
    </section>}
    {newArticlePromptOpen ? <TransitionConfirmDialog busy={transitioning || intakeBusy} error={newArticlePromptError} onCancel={cancelNewArticle} onDiscard={() => void deleteAndContinueNewArticle()} onSave={() => void saveAndContinueNewArticle()} returnFocus={() => confirmReturnFocus.current} /> : null}
    {failedTransition ? <AccessibleDialog title={failedTransition.kind === 'autosave' ? '当前写作区有无法自动保存的文章' : `无法${failedTransition.label}`} onClose={returnToWorkspaceAfterTransitionFailure} returnFocus={() => null} closeOnEscape={!transitioning}>
      <p>{failedTransition.kind === 'autosave' ? `自动保存失败，因此无法安全${failedTransition.label}。` : `执行“${failedTransition.label}”时发生错误。`}</p>
      <p className="field-error">原因：{failedTransition.message}</p>
      {transitionBackupError ? <p className="field-error" role="alert">{transitionBackupError}</p> : null}
      <div className="dialog-actions">
        <button type="button" aria-label={failedTransition.kind === 'autosave' ? '删除当前文章' : undefined} disabled={transitioning || intakeBusy} onClick={failedTransition.kind === 'autosave' ? () => void deleteFailedTransition() : retryFailedTransition}>{failedTransition.kind === 'autosave' ? '删除' : '重试操作'}</button>
        {failedTransition.kind === 'autosave' && !failedTransition.retainsCurrent ? <button type="button" disabled={transitioning || intakeBusy} onClick={() => void discardFailedTransition()}>放弃未保存更改并继续</button> : null}
        {failedTransition.kind === 'autosave' && failedTransition.retainsCurrent ? <button type="button" disabled={transitioning || intakeBusy} onClick={() => setTransitionFailure(undefined)}>继续浏览，暂不打开其他文章</button> : null}
        <button type="button" disabled={transitioning || intakeBusy} onClick={() => void exportTransitionRecovery()}>导出恢复备份</button>
        <button type="button" disabled={transitioning} onClick={returnToWorkspaceAfterTransitionFailure}>返回写作区处理</button>
      </div>
    </AccessibleDialog> : null}
    {previewOpen ? <AccessibleDialog title="IMX 文章预览" className="preview-dialog" onClose={closePreview} returnFocus={() => previewTrigger.current}><DialogClose>{(close) => <PreviewFrame meta={draft.meta} rendered={rendered} css={previewCss} theme={theme} onToggleTheme={toggleTheme} onClose={() => close()} />}</DialogClose></AccessibleDialog> : null}
    {githubOpen ? <Suspense fallback={<p role="status">正在准备推送…</p>}><GithubPanel mode="push" draft={draft} onOpen={openDraft} onPushed={completePush} onClose={() => setGithubOpen(false)} returnFocus={() => githubTrigger.current} /></Suspense> : null}
  </main>
}

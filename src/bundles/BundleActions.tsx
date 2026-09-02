import { useRef, useState } from 'react'
import type { ArticleDraft } from '../metadata/article'
import { validateSlug } from '../metadata/slug'
import { validateMediaReferences } from '../media/references'
import { AccessibleDialog, DialogClose, type DialogCloseOptions } from '../app/AccessibleDialog'
import { LAST_PORTABLE_EXPORT_KEY } from '../drafts/backup-keys'
import { exportArticleBundle } from './export-bundle'
import { importArticleBundle, importLooseArticle } from './import-bundle'
import { importRecoveryBundle } from './recovery-bundle'

interface BundleActionsProps {
  draft: ArticleDraft
  onReplace: (draft: ArticleDraft) => Promise<boolean | void> | boolean | void
  onNew: (draft: ArticleDraft) => Promise<boolean | void> | boolean | void
  onStatus: (message: string) => void
  onImportFocusRequest?: (target: () => HTMLElement | null) => void
  disabled?: boolean
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请保留当前草稿并重试'
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function recordPortableExport(): void {
  try {
    window.localStorage?.setItem(LAST_PORTABLE_EXPORT_KEY, new Date().toISOString())
  } catch {
    // The export itself remains usable when privacy settings deny local storage.
  }
}

function exportWarnings(draft: ArticleDraft): string[] {
  const references = validateMediaReferences(draft.body, draft.media)
  const warnings: string[] = []
  if (!draft.meta.description.trim()) warnings.push('摘要为空')
  if (references.unused.length > 0) warnings.push(`存在未使用图片：${references.unused.join('、')}`)
  if (/!\[[^\]]*]\((?:https?:|data:|\/)/i.test(draft.body)) warnings.push('正文包含外部图片，导出不会打包这些图片')
  if (draft.meta.draft) warnings.push('当前文章仍标记为草稿')
  return warnings
}

export function BundleActions({ draft, onReplace, onNew, onStatus, onImportFocusRequest, disabled = false }: BundleActionsProps) {
  const [error, setError] = useState<string>()
  const [pendingImport, setPendingImport] = useState<ArticleDraft>()
  const [productionDialog, setProductionDialog] = useState(false)
  const [looseIndex, setLooseIndex] = useState<File>()
  const [looseImages, setLooseImages] = useState<File[]>([])
  const importTrigger = useRef<HTMLInputElement>(null)
  const recoveryImportTrigger = useRef<HTMLInputElement>(null)
  const pendingImportTrigger = useRef<HTMLElement | null>(null)
  const productionTrigger = useRef<HTMLButtonElement>(null)
  const slugResult = validateSlug(draft.meta.slug)
  const exportError = !draft.meta.title.trim() ? '标题不能为空' : !slugResult.ok ? slugResult.message : undefined
  const warnings = exportWarnings(draft)

  const stageImport = async (work: () => Promise<ArticleDraft>) => {
    if (disabled) return
    setError(undefined)
    try {
      setPendingImport(await work())
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const exportDraft = async () => {
    if (disabled) return
    setError(undefined)
    try {
      download(await exportArticleBundle(draft, { production: false, publish: false }), `${draft.meta.slug}-draft.zip`)
      recordPortableExport()
      onStatus('草稿 ZIP 已下载')
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const exportProduction = async (publish: boolean) => {
    if (disabled) return
    setError(undefined)
    try {
      const explicitlyChosenDraft = { ...draft, meta: { ...draft.meta, draft: !publish } }
      download(await exportArticleBundle(explicitlyChosenDraft, { production: true, publish }), `${draft.meta.slug}.zip`)
      recordPortableExport()
      setProductionDialog(false)
      productionTrigger.current?.focus()
      onStatus('文章 ZIP 已下载')
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const completeImport = async (operation: (draft: ArticleDraft) => Promise<boolean | void> | boolean | void, close: (options?: DialogCloseOptions) => void) => {
    if (disabled || !pendingImport) return
    setError(undefined)
    try {
      if (await operation(pendingImport) !== false) {
        onImportFocusRequest?.(() => pendingImportTrigger.current)
        close({ restoreFocus: !onImportFocusRequest })
      } else {
        // The app owns transition recovery. Close this staging dialog so its
        // save/recovery choices are not hidden behind a second modal.
        close({ restoreFocus: false })
      }
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return <section className="bundle-actions" role="group" aria-label="文章包操作">
    <h3>导入与导出</h3>
    <div className="bundle-row">
      <label className="file-button">导入文章包<input disabled={disabled} ref={importTrigger} aria-label="导入文章包" type="file" accept="application/zip,.zip" onChange={(event) => {
        const file = event.target.files?.[0]
        event.currentTarget.value = ''
        if (file) { pendingImportTrigger.current = event.currentTarget; void stageImport(() => importArticleBundle(file)) }
      }} /></label>
      <button type="button" disabled={disabled} onClick={() => void exportDraft()}>备份草稿</button>
      <button ref={productionTrigger} type="button" disabled={disabled || Boolean(exportError)} aria-describedby={exportError ? 'production-export-error' : undefined} onClick={() => setProductionDialog(true)}>导出文章</button>
    </div>
    <p className="sidebar-tool-hint">文章包为 ZIP，包含 Markdown 与图片；备份草稿无需填全属性。</p>
    {exportError ? <p id="production-export-error" className="field-error">{exportError}</p> : null}
    <details className="advanced-import"><summary>其他导入方式</summary>
    <details className="loose-import"><summary>从 index.md 和图片导入</summary><label>index.md<input disabled={disabled} aria-label="导入 index.md" type="file" accept="text/markdown,.md" onChange={(event) => setLooseIndex(event.target.files?.[0])} /></label><label>图片<input disabled={disabled} aria-label="导入图片文件" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => setLooseImages(Array.from(event.target.files ?? []))} /></label><button type="button" disabled={disabled || !looseIndex} onClick={() => void stageImport(() => importLooseArticle(looseIndex!, looseImages))}>验证并导入文件</button></details>
    <label className="file-button">紧急恢复<input disabled={disabled} ref={recoveryImportTrigger} aria-label="紧急恢复" type="file" accept="application/zip,.zip" onChange={(event) => {
      const file = event.target.files?.[0]
      event.currentTarget.value = ''
      if (file) { pendingImportTrigger.current = event.currentTarget; void stageImport(() => importRecoveryBundle(file)) }
    }} /></label>
    <p className="sidebar-tool-hint">仅用于故障时下载的紧急恢复 ZIP；普通备份请使用“导入文章包”。</p>
    </details>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    {pendingImport ? <AccessibleDialog title="导入已验证" onClose={() => setPendingImport(undefined)} returnFocus={() => pendingImportTrigger.current}><p>ZIP 已完整验证。请选择替换当前文章，或作为一篇新草稿打开。</p><div className="dialog-actions"><DialogClose>{(close) => <button type="button" disabled={disabled} onClick={close}>取消</button>}</DialogClose><DialogClose>{(close) => <button type="button" disabled={disabled} onClick={() => void completeImport(onReplace, close)}>替换当前文章</button>}</DialogClose><DialogClose>{(close) => <button type="button" disabled={disabled} onClick={() => void completeImport(onNew, close)}>作为新草稿打开</button>}</DialogClose></div></AccessibleDialog> : null}
    {productionDialog ? <AccessibleDialog title="导出 Hugo 文章包" onClose={() => setProductionDialog(false)} returnFocus={() => productionTrigger.current}>{warnings.length > 0 ? <><p>导出前请确认这些提醒：</p><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></> : <p>验证通过，准备下载 Hugo leaf bundle。</p>}<div className="dialog-actions"><DialogClose>{(close) => <button type="button" disabled={disabled} onClick={close}>取消</button>}</DialogClose><button type="button" disabled={disabled} onClick={() => void exportProduction(false)}>保留 draft = true</button><button type="button" disabled={disabled} onClick={() => void exportProduction(true)}>设为 draft = false</button></div></AccessibleDialog> : null}
  </section>
}

export { LAST_PORTABLE_EXPORT_KEY }

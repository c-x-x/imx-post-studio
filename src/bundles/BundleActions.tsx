import { useRef, useState } from 'react'
import type { ArticleDraft } from '../metadata/article'
import { validateSlug } from '../metadata/slug'
import { validateMediaReferences } from '../media/references'
import { exportArticleBundle } from './export-bundle'
import { importArticleBundle, importLooseArticle } from './import-bundle'

interface BundleActionsProps {
  draft: ArticleDraft
  autosaveFailed?: boolean
  onReplace: (draft: ArticleDraft) => void
  onNew: (draft: ArticleDraft) => void
  onStatus: (message: string) => void
}

const LAST_PORTABLE_EXPORT_KEY = 'imx-post-studio:last-portable-export'

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

export function BundleActions({ draft, autosaveFailed = false, onReplace, onNew, onStatus }: BundleActionsProps) {
  const [error, setError] = useState<string>()
  const [pendingImport, setPendingImport] = useState<ArticleDraft>()
  const [productionDialog, setProductionDialog] = useState(false)
  const [looseIndex, setLooseIndex] = useState<File>()
  const [looseImages, setLooseImages] = useState<File[]>([])
  const importTrigger = useRef<HTMLInputElement>(null)
  const slugResult = validateSlug(draft.meta.slug)
  const exportError = !draft.meta.title.trim() ? '标题不能为空' : !slugResult.ok ? slugResult.message : undefined
  const warnings = exportWarnings(draft)

  const returnImportFocus = () => window.setTimeout(() => importTrigger.current?.focus(), 0)
  const stageImport = async (work: () => Promise<ArticleDraft>) => {
    setError(undefined)
    try {
      setPendingImport(await work())
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const exportDraft = async () => {
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
    setError(undefined)
    try {
      download(await exportArticleBundle(draft, { production: true, publish }), `${draft.meta.slug}.zip`)
      recordPortableExport()
      setProductionDialog(false)
      onStatus('文章 ZIP 已下载')
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return <section className="bundle-actions" role="group" aria-label="文章包操作">
    <div className="bundle-row">
      <label className="file-button">导入 ZIP<input ref={importTrigger} aria-label="导入 ZIP" type="file" accept="application/zip,.zip" onChange={(event) => {
        const file = event.target.files?.[0]
        event.currentTarget.value = ''
        if (file) void stageImport(() => importArticleBundle(file))
      }} /></label>
      <button type="button" onClick={() => void exportDraft()}>导出草稿</button>
      <button type="button" disabled={Boolean(exportError)} aria-describedby={exportError ? 'production-export-error' : undefined} onClick={() => setProductionDialog(true)}>导出文章</button>
    </div>
    {exportError ? <p id="production-export-error" className="field-error">{exportError}</p> : null}
    <details className="loose-import"><summary>从 index.md 和图片导入</summary><label>index.md<input aria-label="导入 index.md" type="file" accept="text/markdown,.md" onChange={(event) => setLooseIndex(event.target.files?.[0])} /></label><label>图片<input aria-label="导入图片文件" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => setLooseImages(Array.from(event.target.files ?? []))} /></label><button type="button" disabled={!looseIndex} onClick={() => void stageImport(() => importLooseArticle(looseIndex!, looseImages))}>验证并导入文件</button></details>
    {autosaveFailed ? <p className="emergency-export" role="alert">本地自动保存失败。<button type="button" onClick={() => void exportDraft()}>紧急导出草稿</button></p> : null}
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    {pendingImport ? <div className="modal-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="import-choice-title"><h2 id="import-choice-title">导入已验证</h2><p>ZIP 已完整验证。请选择替换当前文章，或作为一篇新草稿打开。</p><div className="dialog-actions"><button type="button" onClick={() => { setPendingImport(undefined); returnImportFocus() }}>取消</button><button type="button" onClick={() => { onReplace(pendingImport); setPendingImport(undefined); returnImportFocus() }}>替换当前文章</button><button type="button" onClick={() => { onNew(pendingImport); setPendingImport(undefined); returnImportFocus() }}>作为新草稿打开</button></div></section></div> : null}
    {productionDialog ? <div className="modal-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="production-export-title"><h2 id="production-export-title">导出 Hugo 文章包</h2>{warnings.length > 0 ? <><p>导出前请确认这些提醒：</p><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></> : <p>验证通过，准备下载 Hugo leaf bundle。</p>}<div className="dialog-actions"><button type="button" onClick={() => setProductionDialog(false)}>取消</button><button type="button" onClick={() => void exportProduction(false)}>保留 draft = true</button><button type="button" onClick={() => void exportProduction(true)}>设为 draft = false</button></div></section></div> : null}
  </section>
}

export { LAST_PORTABLE_EXPORT_KEY }

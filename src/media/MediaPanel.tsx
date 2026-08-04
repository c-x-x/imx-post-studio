import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import type { MediaAsset, MediaMime } from '../metadata/article'
import { assertImageBytes } from '../bundles/media-validation'
import { MAX_SOURCE_BYTES } from '../shared/limits'
import { safeMediaName } from './names'
import { validateMediaReferences } from './references'
import { CoverCropDialog } from './CoverCropDialog'
import { prepareBodyMediaBatch } from './intake'
import { AccessibleDialog, DialogClose } from '../app/AccessibleDialog'

interface MediaPanelProps {
  draftId?: string
  media: MediaAsset[]
  body: string
  onAddBatch: (assets: MediaAsset[]) => void
  onReplaceCover: (asset: MediaAsset) => void
  onRemove: (id: string) => void
  onInsertImage: (asset: MediaAsset) => void
  disabled?: boolean
  onIntakeBusyChange?: (busy: boolean) => void
}

const COVER_TYPES = new Set<MediaMime>(['image/jpeg', 'image/png', 'image/webp'])
const IMAGE_TYPES = new Set<MediaMime>(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function fileMime(file: File): MediaMime | undefined {
  return IMAGE_TYPES.has(file.type as MediaMime) ? file.type as MediaMime : undefined
}

async function prevalidateCover(file: File): Promise<void> {
  const mime = fileMime(file)
  if (!mime || !COVER_TYPES.has(mime)) throw new Error('封面仅支持 JPEG、PNG 或 WebP 图片')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('单个图片不能超过 25 MiB')
  const name = safeMediaName(file.name)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = assertImageBytes(name, bytes)
  if (detected !== mime) throw new Error(`图片 MIME 与内容不一致：${file.name}`)
}

export function MediaPanel({ draftId = 'default-draft', media, body, onAddBatch, onReplaceCover, onRemove, onInsertImage, disabled = false, onIntakeBusyChange }: MediaPanelProps) {
  const [error, setError] = useState<string>()
  const [pendingCover, setPendingCover] = useState<File>()
  const [removal, setRemoval] = useState<MediaAsset>()
  const panelRef = useRef<HTMLElement>(null)
  const removalTrigger = useRef<HTMLElement | null>(null)
  const namesRef = useRef(new Set(['cover.webp', ...media.map((asset) => asset.name)]))
  const intakeQueue = useRef(Promise.resolve())
  const mounted = useRef(false)
  const generation = useRef(0)
  const activeIntakes = useRef(0)
  const draftIdRef = useRef(draftId)
  const disabledRef = useRef(disabled)
  const intakeBusyCallback = useRef(onIntakeBusyChange)
  useEffect(() => { intakeBusyCallback.current = onIntakeBusyChange }, [onIntakeBusyChange])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      activeIntakes.current = 0
      intakeBusyCallback.current?.(false)
    }
  }, [])
  useLayoutEffect(() => {
    generation.current += 1
    draftIdRef.current = draftId
  }, [draftId])
  useEffect(() => { namesRef.current = new Set(['cover.webp', ...media.map((asset) => asset.name)]) }, [media])
  useLayoutEffect(() => { disabledRef.current = disabled }, [disabled])

  const reportIntakeBusy = () => {
    if (mounted.current) intakeBusyCallback.current?.(activeIntakes.current > 0)
  }

  const queueFiles = (files: File[]) => {
    if (files.length === 0 || disabled || disabledRef.current) return
    setError(undefined)
    const intakeGeneration = generation.current
    const intakeDraftId = draftIdRef.current
    activeIntakes.current += 1
    reportIntakeBusy()
    intakeQueue.current = intakeQueue.current
      .then(async () => {
        const assets = await prepareBodyMediaBatch(files, namesRef.current)
        if (!mounted.current || disabledRef.current || generation.current !== intakeGeneration || draftIdRef.current !== intakeDraftId) return
        namesRef.current = new Set([...namesRef.current, ...assets.map((asset) => asset.name)])
        onAddBatch(assets)
      })
      .catch((cause: unknown) => {
        if (mounted.current && generation.current === intakeGeneration && draftIdRef.current === intakeDraftId) {
          setError(cause instanceof Error ? cause.message : '无法添加图片')
        }
      })
      .finally(() => {
        activeIntakes.current = Math.max(0, activeIntakes.current - 1)
        reportIntakeBusy()
      })
  }

  const selectCover = async (file: File | undefined) => {
    if (!file || disabled || disabledRef.current) return
    setError(undefined)
    try {
      await prevalidateCover(file)
      setPendingCover(file)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取封面')
    }
  }

  const requestRemove = (asset: MediaAsset, trigger: HTMLElement) => {
    const references = validateMediaReferences(body, media)
    if (disabled || disabledRef.current) return
    if (asset.kind === 'body' && !references.unused.includes(`images/${asset.name}`)) {
      removalTrigger.current = trigger
      setRemoval(asset)
    } else {
      onRemove(asset.id)
    }
  }

  const closeRemoval = () => setRemoval(undefined)

  return <section ref={panelRef} className="media-panel" aria-label="媒体" tabIndex={-1}>
    <h2>媒体</h2>
    <div className="media-actions" onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      queueFiles(Array.from(event.dataTransfer.files))
    }} onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
      const files = Array.from(event.clipboardData.files)
      if (files.length > 0) { event.preventDefault(); queueFiles(files) }
    }} tabIndex={0}>
      <label className="file-button">添加正文图片<input disabled={disabled} aria-label="添加正文图片" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { queueFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = '' }} /></label>
      <label className="file-button">选择封面<input disabled={disabled} aria-label="选择封面" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void selectCover(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
      <p>可拖放或粘贴图片；单个文件不超过 25 MiB。</p>
    </div>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    <ul className="media-list" aria-label="已添加图片">
      {media.map((asset) => <li key={asset.id} aria-label={asset.name}><span>{asset.kind === 'cover' ? '封面' : asset.name}</span><div><button type="button" onClick={() => onInsertImage(asset)} disabled={disabled || asset.kind === 'cover'}>插入</button><button type="button" disabled={disabled} onClick={(event) => requestRemove(asset, event.currentTarget)}>删除</button></div></li>)}
    </ul>
    {pendingCover ? <CoverCropDialog disabled={disabled} source={pendingCover} onCancel={() => setPendingCover(undefined)} onComplete={(asset) => { onReplaceCover(asset); setPendingCover(undefined) }} /> : null}
    {removal ? <AccessibleDialog title="删除已引用图片？" onClose={closeRemoval} returnFocus={() => removalTrigger.current ?? panelRef.current}><p>正文仍引用 images/{removal.name}。删除会让最终导出无法通过校验。</p><div className="dialog-actions"><DialogClose>{(close) => <button type="button" disabled={disabled} onClick={close}>取消</button>}</DialogClose><button type="button" disabled={disabled} onClick={() => { onRemove(removal.id); closeRemoval(); panelRef.current?.focus() }}>删除图片</button></div></AccessibleDialog> : null}
  </section>
}

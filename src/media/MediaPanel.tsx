import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import type { MediaAsset, MediaMime } from '../metadata/article'
import { assertImageBytes } from '../bundles/media-validation'
import { MAX_SOURCE_BYTES } from '../shared/limits'
import { safeMediaName, uniqueMediaName } from './names'
import { validateMediaReferences } from './references'
import { CoverCropDialog } from './CoverCropDialog'

interface MediaPanelProps {
  media: MediaAsset[]
  body: string
  onAdd: (asset: MediaAsset) => void
  onReplaceCover: (asset: MediaAsset) => void
  onRemove: (id: string) => void
  onInsertImage: (asset: MediaAsset) => void
}

const BODY_TYPES = new Set<MediaMime>(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const COVER_TYPES = new Set<MediaMime>(['image/jpeg', 'image/png', 'image/webp'])

function fileMime(file: File): MediaMime | undefined {
  return BODY_TYPES.has(file.type as MediaMime) ? file.type as MediaMime : undefined
}

async function prevalidate(file: File, accepted: Set<MediaMime>): Promise<MediaMime> {
  const mime = fileMime(file)
  if (!mime || !accepted.has(mime)) throw new Error('图片格式不受支持：仅支持 JPEG、PNG、WebP 或 GIF')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('单个图片不能超过 25 MiB')
  const name = safeMediaName(file.name)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = assertImageBytes(name, bytes)
  if (detected !== mime) throw new Error(`图片 MIME 与内容不一致：${file.name}`)
  return mime
}

export function MediaPanel({ media, body, onAdd, onReplaceCover, onRemove, onInsertImage }: MediaPanelProps) {
  const [error, setError] = useState<string>()
  const [pendingCover, setPendingCover] = useState<File>()
  const [removal, setRemoval] = useState<MediaAsset>()
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const namesRef = useRef(new Set(media.map((asset) => asset.name)))
  useEffect(() => { namesRef.current = new Set(media.map((asset) => asset.name)) }, [media])

  const addFiles = async (files: File[]) => {
    setError(undefined)
    const names = new Set(namesRef.current)
    for (const file of files) {
      try {
        const mime = await prevalidate(file, BODY_TYPES)
        const name = uniqueMediaName(safeMediaName(file.name), names)
        names.add(name)
        onAdd({ id: crypto.randomUUID(), name, kind: 'body', mime, blob: new Blob([await file.arrayBuffer()], { type: mime }) })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '无法添加图片')
      }
    }
    namesRef.current = names
  }

  const selectCover = async (file: File | undefined) => {
    if (!file) return
    setError(undefined)
    try {
      await prevalidate(file, COVER_TYPES)
      setPendingCover(file)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取封面')
    }
  }

  const requestRemove = (asset: MediaAsset, event: React.MouseEvent<HTMLButtonElement>) => {
    removeTriggerRef.current = event.currentTarget
    const references = validateMediaReferences(body, media)
    if (asset.kind === 'body' && !references.unused.includes(`images/${asset.name}`)) {
      setRemoval(asset)
    } else {
      onRemove(asset.id)
    }
  }

  const closeRemoval = () => {
    setRemoval(undefined)
    window.setTimeout(() => removeTriggerRef.current?.focus(), 0)
  }

  return <section className="media-panel" aria-label="媒体">
    <h2>媒体</h2>
    <div className="media-actions" onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      void addFiles(Array.from(event.dataTransfer.files))
    }} onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
      const files = Array.from(event.clipboardData.files)
      if (files.length > 0) { event.preventDefault(); void addFiles(files) }
    }} tabIndex={0}>
      <label className="file-button">添加正文图片<input aria-label="添加正文图片" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { void addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = '' }} /></label>
      <label className="file-button">选择封面<input aria-label="选择封面" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void selectCover(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
      <p>可拖放或粘贴图片；单个文件不超过 25 MiB。</p>
    </div>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    <ul className="media-list" aria-label="已添加图片">
      {media.map((asset) => <li key={asset.id} aria-label={asset.name}><span>{asset.kind === 'cover' ? '封面' : asset.name}</span><div><button type="button" onClick={() => onInsertImage(asset)} disabled={asset.kind === 'cover'}>插入</button><button type="button" onClick={(event) => requestRemove(asset, event)}>删除</button></div></li>)}
    </ul>
    {pendingCover ? <CoverCropDialog source={pendingCover} onCancel={() => setPendingCover(undefined)} onComplete={(asset) => { onReplaceCover(asset); setPendingCover(undefined) }} /> : null}
    {removal ? <div className="modal-backdrop" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="remove-media-title" className="confirm-dialog"><h2 id="remove-media-title">删除已引用图片？</h2><p>正文仍引用 images/{removal.name}。删除会让最终导出无法通过校验。</p><div className="dialog-actions"><button type="button" onClick={closeRemoval}>取消</button><button type="button" onClick={() => { onRemove(removal.id); closeRemoval() }}>删除图片</button></div></section></div> : null}
  </section>
}

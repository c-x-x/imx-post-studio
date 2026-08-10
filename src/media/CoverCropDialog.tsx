import { useEffect, useRef, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import type { MediaAsset } from '../metadata/article'
import { AccessibleDialog, DialogClose } from '../app/AccessibleDialog'
import { renderCover } from './cover'

interface CoverCropDialogProps {
  source: File
  onCancel: () => void
  onComplete: (asset: MediaAsset) => void
  disabled?: boolean
}

export function CoverCropDialog({ source, onCancel, onComplete, disabled = false }: CoverCropDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area>({ x: 0, y: 0, width: 100, height: 100 })
  const [error, setError] = useState<string>()
  const [processing, setProcessing] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const closedRef = useRef(false)
  const [previewUrl] = useState(() => URL.createObjectURL(source))

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  const close = () => {
    closedRef.current = true
    onCancel()
  }

  const confirm = async () => {
    if (disabled) return
    setProcessing(true)
    setError(undefined)
    try {
      const result = await renderCover(source, {
        x: area.x / 100,
        y: area.y / 100,
        width: area.width / 100,
        height: area.height / 100,
      })
      if (closedRef.current) return
      onComplete({
        id: crypto.randomUUID(),
        name: 'cover.webp',
        kind: 'cover',
        mime: 'image/webp',
        blob: result.blob,
        width: result.width,
        height: result.height,
      })
      triggerRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '封面转换失败，请更换图片后重试')
    } finally {
      setProcessing(false)
    }
  }

  return <AccessibleDialog title="裁剪封面" className="crop-dialog" onClose={close} returnFocus={() => triggerRef.current}>
      <p>封面将裁剪为 16:9，并导出为 1600×900 以内的 WebP。</p>
      <div className="crop-canvas"><Cropper image={previewUrl} crop={crop} zoom={zoom} aspect={16 / 9} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(percentages) => setArea(percentages)} /></div>
      <label htmlFor="cover-zoom">缩放<input id="cover-zoom" disabled={disabled} type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      {error ? <p role="alert" className="field-error">{error}</p> : null}
      <div className="dialog-actions"><DialogClose>{(dialogClose) => <button type="button" onClick={dialogClose} disabled={disabled || processing}>取消</button>}</DialogClose><button type="button" onClick={() => void confirm()} disabled={disabled || processing}>{processing ? '正在转换…' : '使用此封面'}</button></div>
  </AccessibleDialog>
}

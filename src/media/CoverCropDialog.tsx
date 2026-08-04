import { useEffect, useRef, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import type { MediaAsset } from '../metadata/article'
import { renderCover } from './cover'

interface CoverCropDialogProps {
  source: File
  onCancel: () => void
  onComplete: (asset: MediaAsset) => void
}

export function CoverCropDialog({ source, onCancel, onComplete }: CoverCropDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area>({ x: 0, y: 0, width: 100, height: 100 })
  const [error, setError] = useState<string>()
  const [processing, setProcessing] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const [previewUrl] = useState(() => URL.createObjectURL(source))

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  const close = () => {
    onCancel()
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  const confirm = async () => {
    setProcessing(true)
    setError(undefined)
    try {
      const result = await renderCover(source, {
        x: area.x / 100,
        y: area.y / 100,
        width: area.width / 100,
        height: area.height / 100,
      })
      onComplete({
        id: crypto.randomUUID(),
        name: 'cover.webp',
        kind: 'cover',
        mime: 'image/webp',
        blob: result.blob,
        width: result.width,
        height: result.height,
      })
      window.setTimeout(() => triggerRef.current?.focus(), 0)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '封面转换失败，请更换图片后重试')
    } finally {
      setProcessing(false)
    }
  }

  return <div className="modal-backdrop" role="presentation">
    <section className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="cover-crop-title">
      <h2 id="cover-crop-title">裁剪封面</h2>
      <p>封面将裁剪为 16:9，并导出为 1600×900 以内的 WebP。</p>
      <div className="crop-canvas"><Cropper image={previewUrl} crop={crop} zoom={zoom} aspect={16 / 9} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_pixels, percentages) => setArea(percentages)} /></div>
      <label htmlFor="cover-zoom">缩放<input id="cover-zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      {error ? <p role="alert" className="field-error">{error}</p> : null}
      <div className="dialog-actions"><button type="button" onClick={close} disabled={processing}>取消</button><button type="button" onClick={() => void confirm()} disabled={processing}>{processing ? '正在转换…' : '使用此封面'}</button></div>
    </section>
  </div>
}

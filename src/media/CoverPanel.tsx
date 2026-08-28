import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MediaAsset, MediaMime } from '../metadata/article'
import { validateBrowserImage } from './validate-image'
import { MAX_SOURCE_BYTES } from '../shared/limits'
import { safeMediaName } from './names'
import { CoverCropDialog } from './CoverCropDialog'

interface CoverPanelProps {
  draftId?: string
  cover?: MediaAsset
  onReplace: (asset: MediaAsset) => void
  onRemove: (id: string) => void
  disabled?: boolean
  onIntakeBusyChange?: (busy: boolean) => void
}

interface IntakeToken {
  generation: number
  draftId: string
}

const COVER_TYPES = new Set<MediaMime>(['image/jpeg', 'image/png', 'image/webp'])

async function prevalidateCover(file: File): Promise<void> {
  const mime = COVER_TYPES.has(file.type as MediaMime) ? file.type as MediaMime : undefined
  if (!mime) throw new Error('封面仅支持 JPEG、PNG 或 WebP 图片')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('单个图片不能超过 25 MiB')
  const name = safeMediaName(file.name)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = await validateBrowserImage(name, bytes)
  if (detected !== mime) throw new Error(`图片 MIME 与内容不一致：${file.name}`)
}

export function CoverPanel({ draftId = 'default-draft', cover, onReplace, onRemove, disabled = false, onIntakeBusyChange }: CoverPanelProps) {
  const [error, setError] = useState<string>()
  const [pendingCover, setPendingCover] = useState<File>()
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
  useLayoutEffect(() => { disabledRef.current = disabled }, [disabled])

  const reportIntakeBusy = () => {
    if (mounted.current) intakeBusyCallback.current?.(activeIntakes.current > 0)
  }
  const beginIntake = (): IntakeToken => {
    const token = { generation: generation.current, draftId: draftIdRef.current }
    activeIntakes.current += 1
    reportIntakeBusy()
    return token
  }
  const intakeIsCurrent = (token: IntakeToken): boolean => (
    mounted.current && !disabledRef.current && generation.current === token.generation && draftIdRef.current === token.draftId
  )
  const finishIntake = () => {
    activeIntakes.current = Math.max(0, activeIntakes.current - 1)
    reportIntakeBusy()
  }
  const selectCover = async (file: File | undefined) => {
    if (!file || disabled || disabledRef.current) return
    setError(undefined)
    const token = beginIntake()
    try {
      await prevalidateCover(file)
      if (intakeIsCurrent(token)) setPendingCover(file)
    } catch (cause) {
      if (intakeIsCurrent(token)) setError(cause instanceof Error ? cause.message : '无法读取封面')
    } finally {
      finishIntake()
    }
  }

  return <section className="cover-panel" aria-label="文章封面">
    <h2>文章封面</h2>
    <label className="file-button">选择封面<input disabled={disabled} aria-label="选择封面" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void selectCover(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
    <p className="cover-help">支持 JPEG、PNG 或 WebP；裁剪后保存为 cover.webp。</p>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {cover ? <div className="cover-item" aria-label="当前封面"><span>封面</span><button type="button" disabled={disabled} aria-label="删除封面" onClick={() => onRemove(cover.id)}>删除</button></div> : null}
    {pendingCover ? <CoverCropDialog disabled={disabled} source={pendingCover} onCancel={() => setPendingCover(undefined)} onComplete={(asset) => { onReplace(asset); setPendingCover(undefined) }} /> : null}
  </section>
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ArticleMeta } from '../metadata/article'
import type { RenderedMarkdown } from './markdown'
import { buildPreviewDocument } from './build-preview-document'
import './preview-frame.css'

interface PreviewFrameProps {
  meta: ArticleMeta
  rendered: RenderedMarkdown
  css: string
  onClose: () => void
}

export function PreviewFrame({ meta, rendered, css, onClose }: PreviewFrameProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 720px)').matches
      ? 'mobile'
      : 'desktop'
  ))
  const [frameHeight, setFrameHeight] = useState(720)
  const frameObserver = useRef<ResizeObserver | undefined>(undefined)
  const documentHtml = useMemo(
    () => buildPreviewDocument({ meta, rendered, css, theme }),
    [css, meta, rendered, theme],
  )

  const resizeFrame = useCallback((frame: HTMLIFrameElement) => {
    const document = frame.contentDocument
    if (!document) return
    const measure = () => {
      const nextHeight = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 720))
      setFrameHeight((current) => current === nextHeight ? current : nextHeight)
    }
    frameObserver.current?.disconnect()
    if (typeof ResizeObserver !== 'undefined') {
      frameObserver.current = new ResizeObserver(measure)
      frameObserver.current.observe(document.documentElement)
      frameObserver.current.observe(document.body)
    }
    measure()
    window.requestAnimationFrame(measure)
  }, [])

  useEffect(() => () => frameObserver.current?.disconnect(), [])

  const frameWidth = viewport === 'desktop'
    ? 1180
    : typeof window === 'undefined'
      ? 390
      : Math.min(390, Math.max(320, window.innerWidth - 20))
  return <section className="preview-surface" aria-label="IMX 文章预览内容">
    <header className="preview-dock">
      <button className="preview-back" type="button" onClick={onClose}><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg></span>返回编辑</button>
      <p className="preview-stats">约 {rendered.wordCount} 字，预计 {rendered.readingMinutes} 分钟阅读</p>
      <div className="preview-controls" role="group" aria-label="预览设置">
        <button type="button" aria-label="浅色预览" title="浅色预览" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg></button>
        <button type="button" aria-label="深色预览" title="深色预览" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.2 15.2A8.6 8.6 0 0 1 8.8 3.8 8.6 8.6 0 1 0 20.2 15.2Z" /></svg></button>
        <span className="preview-control-divider" aria-hidden="true" />
        <button type="button" aria-label="桌面预览" title="桌面预览" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg></button>
        <button type="button" aria-label="移动预览" title="移动预览" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M10 5h4M11 19h2" /></svg></button>
      </div>
    </header>
    <div className={`preview-viewport preview-viewport-${viewport}`} tabIndex={0} aria-label="预览画布，可水平滚动">
      <iframe className="preview-frame" title="IMX 文章预览" sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={documentHtml} onLoad={(event) => resizeFrame(event.currentTarget)} style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }} />
    </div>
  </section>
}

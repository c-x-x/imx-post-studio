import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ArticleMeta } from '../metadata/article'
import type { RenderedMarkdown } from './markdown'
import { buildPreviewDocument } from './build-preview-document'
import './preview-frame.css'

interface PreviewFrameProps {
  meta: ArticleMeta
  rendered: RenderedMarkdown
  css: string
}

export function PreviewFrame({ meta, rendered, css }: PreviewFrameProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
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

  const frameWidth = viewport === 'desktop' ? 1180 : 390
  return <section aria-label="IMX 文章预览"><div className="preview-controls" role="group" aria-label="预览设置"><button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>浅色预览</button><button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>深色预览</button><button type="button" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}>桌面预览</button><button type="button" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}>移动预览</button></div><p>约 {rendered.wordCount} 字，预计 {rendered.readingMinutes} 分钟阅读</p><div className={`preview-viewport preview-viewport-${viewport}`} tabIndex={0} aria-label="预览画布，可水平滚动"><iframe className="preview-frame" title="IMX 文章预览" sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={documentHtml} onLoad={(event) => resizeFrame(event.currentTarget)} style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }} /></div></section>
}

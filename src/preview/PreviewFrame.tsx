import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArticleMeta } from '../metadata/article'
import type { AppTheme } from '../app/theme-preference'
import type { RenderedMarkdown } from './markdown'
import { buildPreviewDocument } from './build-preview-document'
import { SHARED_DOCK_SCROLL_EVENT, useSharedDock } from '../app/use-shared-dock'
import '../app/shared-dock.css'
import './preview-frame.css'

interface PreviewFrameProps {
  meta: ArticleMeta
  rendered: RenderedMarkdown
  css: string
  theme: AppTheme
  onThemeChange: (theme: AppTheme) => void
  onClose: () => void
}

function wirePreviewFrameScroll(frame: HTMLIFrameElement, dock: HTMLElement | null, onScroll: (scrollTop: number) => void): void {
  const document = frame.contentDocument
  const window = frame.contentWindow
  if (!document || !window) return
  const toc = document.querySelector<HTMLElement>('.article-page .toc')
  const headings = [...document.querySelectorAll<HTMLElement>('.article-content h2, .article-content h3, .article-content h4, .article-content h5, .article-content h6')]
  const tocLinkById = new Map<string, HTMLAnchorElement>()
  document.querySelectorAll<HTMLAnchorElement>('.toc a').forEach((link) => {
    try {
      const hash = new URL(link.href).hash.slice(1)
      tocLinkById.set(decodeURIComponent(hash), link)
    } catch { /* Ignore malformed directory links. */ }
  })
  let lastScrollTop = -1
  let activeTocLink: HTMLAnchorElement | undefined
  const readScrollTop = () => Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop)
  const syncDock = () => dock?.dispatchEvent(new CustomEvent(SHARED_DOCK_SCROLL_EVENT, {
    detail: {
      scrollTop: readScrollTop(),
      viewportHeight: window.innerHeight,
    },
  }))
  const syncToc = (scrollTop: number) => {
    if (!toc || headings.length === 0) return
    const probeTop = scrollTop + Math.min(Math.max(window.innerHeight * 0.22, 112), 168)
    let nextActiveLink: HTMLAnchorElement | undefined
    for (const heading of headings) {
      if (scrollTop + heading.getBoundingClientRect().top > probeTop) break
      nextActiveLink = tocLinkById.get(heading.id) ?? nextActiveLink
    }
    nextActiveLink ??= tocLinkById.get(headings[0].id)
    if (!nextActiveLink) return
    if (nextActiveLink !== activeTocLink) {
      activeTocLink?.classList.remove('active')
      nextActiveLink.classList.add('active')
      activeTocLink = nextActiveLink
    }
    if (toc.scrollHeight <= toc.clientHeight + 2) return
    const tocBounds = toc.getBoundingClientRect()
    const linkBounds = nextActiveLink.getBoundingClientRect()
    const linkCenter = linkBounds.top - tocBounds.top + toc.scrollTop + linkBounds.height / 2
    const targetTop = linkCenter - toc.clientHeight * 0.42
    toc.scrollTop = Math.min(Math.max(targetTop, 0), toc.scrollHeight - toc.clientHeight)
  }
  const trackScroll = () => {
    if (!frame.isConnected || frame.contentDocument !== document) return
    const scrollTop = readScrollTop()
    if (scrollTop !== lastScrollTop) {
      lastScrollTop = scrollTop
      onScroll(scrollTop)
      syncDock()
      syncToc(scrollTop)
    }
    requestAnimationFrame(trackScroll)
  }
  requestAnimationFrame(trackScroll)
}

export function PreviewFrame({ meta, rendered, css, theme, onThemeChange, onClose }: PreviewFrameProps) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 720px)').matches
      ? 'mobile'
      : 'desktop'
  ))
  const dockRef = useRef<HTMLElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const frameScrollTop = useRef(0)
  const wiredDocument = useRef<Document | null>(null)
  useSharedDock(dockRef)
  const documentHtml = useMemo(
    () => buildPreviewDocument({ meta, rendered, css, theme }),
    [css, meta, rendered, theme],
  )

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let readinessFrame = 0
    const connectFrame = () => {
      const document = frame.contentDocument
      if (document === wiredDocument.current) return true
      if (!document?.querySelector('.article-page')) return false
      wiredDocument.current = document
      const scroller = document.scrollingElement as HTMLElement | null
      const savedScrollTop = frameScrollTop.current
      let restoringScroll = savedScrollTop > 0
      if (scroller) scroller.style.scrollBehavior = 'auto'
      wirePreviewFrameScroll(frame, dockRef.current, (scrollTop) => {
        if (!restoringScroll) frameScrollTop.current = scrollTop
      })
      if (scroller && restoringScroll) {
        let attempts = 0
        const restoreScroll = () => {
          scroller.scrollTop = savedScrollTop
          attempts += 1
          if (Math.abs(scroller.scrollTop - savedScrollTop) > 1 && attempts < 12) {
            requestAnimationFrame(restoreScroll)
            return
          }
          restoringScroll = false
          frameScrollTop.current = scroller.scrollTop
        }
        requestAnimationFrame(restoreScroll)
      }
      return true
    }
    const connectWhenReady = () => {
      cancelAnimationFrame(readinessFrame)
      if (!connectFrame()) readinessFrame = requestAnimationFrame(connectWhenReady)
    }
    connectWhenReady()
    frame.addEventListener('load', connectWhenReady)
    return () => {
      cancelAnimationFrame(readinessFrame)
      frame.removeEventListener('load', connectWhenReady)
    }
  }, [documentHtml])

  const frameWidth = viewport === 'desktop'
    ? 1180
    : typeof window === 'undefined'
      ? 390
      : Math.min(390, Math.max(320, window.innerWidth - 20))
  return <section className="preview-surface" data-theme={theme} data-viewport={viewport} data-shared-dock-scroll aria-label="IMX 文章预览内容">
    <header ref={dockRef} className="preview-dock has-shared-dock">
      <div className="preview-dock__container" data-shared-dock="container">
        <span className="preview-dock__shell" data-shared-dock="shell" aria-hidden="true" />
        <button className="preview-back" data-shared-dock="left" type="button" onClick={onClose}><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg></span>返回编辑</button>
        <p className="preview-stats" data-shared-dock="center">约 {rendered.wordCount} 字，预计 {rendered.readingMinutes} 分钟阅读</p>
        <div className="preview-controls" data-shared-dock="right" role="group" aria-label="预览设置">
        <div className="preview-control-group" data-selection={theme}>
          <button type="button" aria-label="浅色预览" title="浅色预览" aria-pressed={theme === 'light'} onClick={() => onThemeChange('light')}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg></button>
          <button type="button" aria-label="深色预览" title="深色预览" aria-pressed={theme === 'dark'} onClick={() => onThemeChange('dark')}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.2 15.2A8.6 8.6 0 0 1 8.8 3.8 8.6 8.6 0 1 0 20.2 15.2Z" /></svg></button>
        </div>
        <span className="preview-control-divider" aria-hidden="true" />
        <div className="preview-control-group" data-selection={viewport}>
          <button type="button" data-shared-dock="action-control" aria-label="桌面预览" title="桌面预览" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg></button>
          <button type="button" aria-label="移动预览" title="移动预览" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M10 5h4M11 19h2" /></svg></button>
        </div>
        </div>
      </div>
    </header>
    <div className={`preview-viewport preview-viewport-${viewport}`} tabIndex={0} aria-label="预览画布，可水平滚动">
      <iframe ref={frameRef} className="preview-frame" title="IMX 文章预览" sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={documentHtml} style={{ width: `${frameWidth}px` }} />
    </div>
  </section>
}

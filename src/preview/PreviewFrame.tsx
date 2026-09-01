import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArticleMeta } from '../metadata/article'
import type { AppTheme } from '../app/theme-preference'
import type { RenderedMarkdown } from './markdown'
import { buildPreviewDocument } from './build-preview-document'
import { extractFontFaces } from './font-faces'
import { SHARED_DOCK_SCROLL_EVENT, useSharedDock } from '../app/use-shared-dock'
import '../app/shared-dock.css'
import './preview-frame.css'

interface PreviewFrameProps {
  meta: ArticleMeta
  rendered: RenderedMarkdown
  css: string
  theme: AppTheme
  onToggleTheme: () => void
  onClose: () => void
}

function renderPreviewContent(host: HTMLElement, html: string): ShadowRoot {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  const template = host.ownerDocument.createElement('template')
  template.innerHTML = html
  root.replaceChildren(template.content.cloneNode(true))
  return root
}

function wirePreviewFrameScroll(host: HTMLElement, root: ShadowRoot, dock: HTMLElement | null, onScroll: (scrollTop: number) => void): () => void {
  const toc = root.querySelector<HTMLElement>('.article-page .toc')
  const sidebar = root.querySelector<HTMLElement>('.article-page .sidebar')
  const layout = root.querySelector<HTMLElement>('.article-page .layout-with-sidebar')
  const headings = [...root.querySelectorAll<HTMLElement>('.article-content h1, .article-content h2, .article-content h3, .article-content h4, .article-content h5, .article-content h6')]
  const tocLinkById = new Map<string, HTMLAnchorElement>()
  root.querySelectorAll<HTMLAnchorElement>('.toc a').forEach((link) => {
    try {
      const hash = (link.getAttribute('href') ?? '').replace(/^#/, '')
      tocLinkById.set(decodeURIComponent(hash), link)
    } catch { /* Ignore malformed directory links. */ }
  })
  let lastScrollTop = -1
  let activeTocLink: HTMLAnchorElement | undefined
  const syncDock = () => dock?.dispatchEvent(new CustomEvent(SHARED_DOCK_SCROLL_EVENT, {
    detail: {
      scrollTop: host.scrollTop,
      viewportHeight: host.clientHeight,
    },
  }))
  const syncSidebar = (scrollTop: number) => {
    if (!sidebar || !layout) return
    if (host.clientWidth <= 768) {
      sidebar.style.removeProperty('position')
      sidebar.style.removeProperty('top')
      sidebar.style.removeProperty('transform')
      return
    }
    const stickyOffset = Number.parseFloat(getComputedStyle(sidebar).top) || 0
    sidebar.style.position = 'relative'
    sidebar.style.top = 'auto'
    const hostTop = host.getBoundingClientRect().top
    const layoutTop = scrollTop + layout.getBoundingClientRect().top - hostTop
    const stickyStart = layoutTop + sidebar.offsetTop - stickyOffset
    sidebar.style.transform = `translateY(${Math.max(scrollTop - stickyStart, 0)}px)`
  }
  const syncToc = (scrollTop: number) => {
    if (!toc || headings.length === 0) return
    const probeTop = scrollTop + Math.min(Math.max(host.clientHeight * 0.22, 112), 168)
    const hostTop = host.getBoundingClientRect().top
    let nextActiveLink: HTMLAnchorElement | undefined
    for (const heading of headings) {
      if (scrollTop + heading.getBoundingClientRect().top - hostTop > probeTop) break
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
  let animationFrame = 0
  const sync = () => {
    animationFrame = 0
    const scrollTop = host.scrollTop
    syncSidebar(scrollTop)
    if (scrollTop !== lastScrollTop) {
      lastScrollTop = scrollTop
      onScroll(scrollTop)
      syncDock()
      syncToc(scrollTop)
    }
  }
  const scheduleSync = () => {
    if (!animationFrame) animationFrame = requestAnimationFrame(sync)
  }
  const followDirectoryLink = (event: Event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
    if (!link || !root.contains(link)) return
    let id: string
    try { id = decodeURIComponent((link.getAttribute('href') ?? '').slice(1)) } catch { return }
    const heading = root.getElementById(id)
    if (!heading) return
    event.preventDefault()
    host.scrollTo({
      top: host.scrollTop + heading.getBoundingClientRect().top - host.getBoundingClientRect().top,
      behavior: 'smooth',
    })
  }
  host.addEventListener('scroll', scheduleSync, { passive: true })
  root.addEventListener('click', followDirectoryLink)
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleSync) : null
  resizeObserver?.observe(host)
  scheduleSync()
  return () => {
    host.removeEventListener('scroll', scheduleSync)
    root.removeEventListener('click', followDirectoryLink)
    resizeObserver?.disconnect()
    cancelAnimationFrame(animationFrame)
  }
}

function wirePreviewTocToggle(root: ShadowRoot): () => void {
  const input = root.querySelector<HTMLInputElement>('.toc-toggle-input')
  const tools = root.querySelector<HTMLElement>('.article-page .article-tools')
  const sidebar = root.querySelector<HTMLElement>('.article-page .sidebar')
  const toggle = root.querySelector<HTMLElement>('.article-page .sidebar-toggle')
  if (!input || !tools || !sidebar) return () => undefined
  const sync = () => {
    const open = input.checked
    input.setAttribute('aria-expanded', String(open))
    tools.classList.toggle('is-toc-open', open)
    sidebar.classList.toggle('active', open)
    toggle?.classList.toggle('active', open)
  }
  const handleToggleClick = (event: Event) => {
    const target = (event.target as Element | null)?.closest('.sidebar-toggle')
    if (!target || !root.contains(target)) return
    event.preventDefault()
    input.checked = !input.checked
    sync()
  }
  input.addEventListener('change', sync)
  root.addEventListener('click', handleToggleClick)
  sync()
  return () => {
    input.removeEventListener('change', sync)
    root.removeEventListener('click', handleToggleClick)
  }
}

function wirePreviewCodeCopy(root: ShadowRoot): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const copyText = async (text: string): Promise<void> => {
    const document = root.ownerDocument
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy')
    textarea.remove()
    if (copied) return
    const clipboard = document.defaultView?.navigator.clipboard
    if (!clipboard?.writeText) throw new Error('Clipboard API unavailable')
    await clipboard.writeText(text)
  }
  const handleClick = async (event: Event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-copy-code]')
    if (!button || !root.contains(button)) return
    const code = button.closest('.highlight')?.querySelector('pre code')?.textContent ?? ''
    try {
      await copyText(code)
      button.textContent = '已复制'
      button.dataset.copyState = 'success'
    } catch {
      button.textContent = '复制失败'
      button.dataset.copyState = 'error'
    }
    const timer = setTimeout(() => {
      button.textContent = '复制'
      delete button.dataset.copyState
      timers.delete(timer)
    }, 1600)
    timers.add(timer)
  }
  root.addEventListener('click', handleClick)
  return () => {
    root.removeEventListener('click', handleClick)
    timers.forEach(clearTimeout)
  }
}

export function PreviewFrame({ meta, rendered, css, theme, onToggleTheme, onClose }: PreviewFrameProps) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 720px)').matches
      ? 'mobile'
      : 'desktop'
  ))
  const dockRef = useRef<HTMLElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const frameScrollTop = useRef(0)
  const [documentTheme] = useState(theme)
  useSharedDock(dockRef)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(max-width: 720px)')
    const syncViewport = () => setViewport(query.matches ? 'mobile' : 'desktop')
    syncViewport()
    query.addEventListener?.('change', syncViewport)
    return () => query.removeEventListener?.('change', syncViewport)
  }, [])

  const documentHtml = useMemo(
    () => buildPreviewDocument({ meta, rendered, css, theme: documentTheme }),
    [css, documentTheme, meta, rendered],
  )

  useEffect(() => {
    const fontCss = extractFontFaces(css)
    if (!fontCss) return
    const style = document.createElement('style')
    style.dataset.previewFonts = ''
    style.textContent = fontCss
    document.head.append(style)
    return () => style.remove()
  }, [css])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    frame.dataset.theme = theme
    const previewHtml = frame.shadowRoot?.querySelector<HTMLElement>('.preview-html')
    if (previewHtml) {
      previewHtml.dataset.theme = theme
      previewHtml.dataset.previewViewport = viewport
    }
  }, [theme, viewport])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const root = renderPreviewContent(frame, documentHtml)
    const previewHtml = root.querySelector<HTMLElement>('.preview-html')
    if (previewHtml) {
      previewHtml.dataset.theme = frame.dataset.theme ?? documentTheme
      previewHtml.dataset.previewViewport = viewport
    }
    const syncFloatingEdges = () => {
      if (!previewHtml) return
      const bounds = frame.getBoundingClientRect()
      previewHtml.style.setProperty('--preview-floating-right', `${Math.max(window.innerWidth - bounds.right, 0) + 32}px`)
      previewHtml.style.setProperty('--preview-floating-bottom', `${Math.max(window.innerHeight - bounds.bottom, 0) + 32}px`)
    }
    syncFloatingEdges()
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(syncFloatingEdges) : null
    resizeObserver?.observe(frame)
    window.addEventListener('resize', syncFloatingEdges)
    const savedScrollTop = frameScrollTop.current
    let restoringScroll = savedScrollTop > 0
    const disconnectCodeCopy = wirePreviewCodeCopy(root)
    const disconnectTocToggle = wirePreviewTocToggle(root)
    const disconnectScroll = wirePreviewFrameScroll(frame, root, dockRef.current, (scrollTop) => {
      if (!restoringScroll) frameScrollTop.current = scrollTop
    })
    let restoreFrame = 0
    if (restoringScroll) {
      let attempts = 0
      const restoreScroll = () => {
        frame.scrollTop = savedScrollTop
        attempts += 1
        if (Math.abs(frame.scrollTop - savedScrollTop) > 1 && attempts < 12) {
          restoreFrame = requestAnimationFrame(restoreScroll)
          return
        }
        restoringScroll = false
        frameScrollTop.current = frame.scrollTop
      }
      restoreFrame = requestAnimationFrame(restoreScroll)
    }
    return () => {
      cancelAnimationFrame(restoreFrame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncFloatingEdges)
      disconnectCodeCopy()
      disconnectTocToggle()
      disconnectScroll()
    }
  }, [documentHtml, documentTheme, viewport])

  return <section className="preview-surface" data-theme={theme} data-viewport={viewport} data-shared-dock-scroll aria-label="IMX 文章预览内容">
    <header ref={dockRef} className="preview-dock has-shared-dock">
      <div className="preview-dock__container" data-shared-dock="container">
        <span className="preview-dock__shell" data-shared-dock="shell" aria-hidden="true" />
        <button className="preview-back" data-shared-dock="left" type="button" onClick={onClose}><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg></span>返回编辑</button>
        <p className="preview-stats" data-shared-dock="center">约 {rendered.wordCount} 字，预计 {rendered.readingMinutes} 分钟阅读</p>
        <div className="preview-controls" data-shared-dock="right">
          <button type="button" data-shared-dock="action-control" aria-label={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'} title={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'} onClick={onToggleTheme}>{theme === 'light'
            ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.2 15.2A8.6 8.6 0 0 1 8.8 3.8 8.6 8.6 0 1 0 20.2 15.2Z" /></svg>
            : <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>}</button>
        </div>
      </div>
    </header>
    <div className="preview-viewport" tabIndex={0} aria-label="文章预览画布">
      <div ref={frameRef} className="preview-frame" title="IMX 文章预览" role="document" aria-label="IMX 文章预览" data-theme={theme} style={{ width: 'min(1180px, 100%)' }} />
    </div>
  </section>
}

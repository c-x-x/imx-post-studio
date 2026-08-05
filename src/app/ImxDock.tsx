import { useEffect, useRef, useState, type RefObject } from 'react'
import { ImxLogo } from './ImxLogo'
import { useLiquidIndicator } from './use-liquid-indicator'
import { useSharedDock } from './use-shared-dock'
import './imx-dock.css'

export interface ImxDockProps {
  view: 'home' | 'dashboard' | 'workspace'
  disabled: boolean
  previewTrigger: RefObject<HTMLButtonElement | null>
  onPreview: () => void
  onHome: () => void
  onArticle: () => void
  onDashboard: () => void
}

export function ImxDock({
  view,
  disabled,
  previewTrigger,
  onPreview,
  onHome,
  onArticle,
  onDashboard,
}: ImxDockProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  useSharedDock(navRef)
  useLiquidIndicator(menuRef, view)

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !navRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOutside)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [menuOpen])

  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 768px)')
    if (!query) return
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) setMenuOpen(false)
    }
    query.addEventListener?.('change', closeOnDesktop)
    return () => query.removeEventListener?.('change', closeOnDesktop)
  }, [])

  const choose = (action: () => void) => {
    setMenuOpen(false)
    action()
  }

  return <nav ref={navRef} className="imx-dock has-shared-dock" aria-label="Studio 导航">
    <div className="imx-dock__container">
      <span className="imx-dock__shell" aria-hidden="true" />
      <div className="imx-dock__brand imx-dock__brand-default-logo">
        <ImxLogo />
        <h1>IMX Post Studio</h1>
      </div>
      <ul ref={menuRef} className={`imx-dock__menu has-active${menuOpen ? ' active' : ''}`}>
        <li><button className={view === 'home' ? 'active' : undefined} type="button" disabled={disabled} aria-current={view === 'home' ? 'page' : 'false'} onClick={() => choose(onHome)}>首页</button></li>
        <li><button className={view === 'workspace' ? 'active' : undefined} type="button" disabled={disabled} aria-current={view === 'workspace' ? 'page' : 'false'} onClick={() => choose(onArticle)}>文章</button></li>
        <li><button className={view === 'dashboard' ? 'active' : undefined} type="button" disabled={disabled} aria-current={view === 'dashboard' ? 'page' : 'false'} onClick={() => choose(onDashboard)}>草稿库</button></li>
        <li className="imx-dock__menu-outline" aria-hidden="true" />
      </ul>
      <div className="imx-dock__actions">
        {view === 'workspace'
          ? <button ref={previewTrigger} className="imx-dock__preview" type="button" disabled={disabled} onClick={onPreview}>预览文章</button>
          : <span className="imx-dock__privacy" aria-label="文章和图片仅在此浏览器中处理" title="文章和图片仅在此浏览器中处理">本地处理</span>}
        <button className={`imx-dock__menu-toggle${menuOpen ? ' active' : ''}`} type="button" aria-label={menuOpen ? '关闭菜单' : '打开菜单'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <span className="imx-dock__menu-icon" aria-hidden="true">
            <svg className="imx-dock__menu-icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <svg className="imx-dock__menu-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </span>
        </button>
      </div>
    </div>
  </nav>
}

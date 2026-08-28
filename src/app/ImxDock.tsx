import { useEffect, useRef, useState } from 'react'
import { ImxLogo } from './ImxLogo'
import { useLiquidIndicator } from './use-liquid-indicator'
import { useSharedDock } from './use-shared-dock'
import type { AppTheme } from './theme-preference'
import './shared-dock.css'
import './imx-dock.css'

export interface ImxDockProps {
  view: 'home' | 'dashboard' | 'workspace' | 'works'
  disabled: boolean
  onHome: () => void
  onArticle: () => void
  onDashboard: () => void
  onWorks: () => void
  theme: AppTheme
  onToggleTheme: () => void
}

export function ImxDock({
  view,
  disabled,
  onHome,
  onArticle,
  onDashboard,
  onWorks,
  theme,
  onToggleTheme,
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
    <div className="imx-dock__container" data-shared-dock="container">
      <span className="imx-dock__shell" data-shared-dock="shell" aria-hidden="true" />
      <button className="imx-dock__brand imx-dock__brand-default-logo" data-shared-dock="left" type="button" disabled={disabled} aria-label="IPOST，返回首页" onClick={onHome}>
        <ImxLogo />
        <span className="imx-dock__brand-title">IPOST</span>
      </button>
      <h1 className="visually-hidden">IMX Post Studio</h1>
      <ul ref={menuRef} className={`imx-dock__menu has-active${menuOpen ? ' active' : ''}`} data-shared-dock="center">
        <li><button className={view === 'home' ? 'active' : undefined} type="button" disabled={disabled} aria-current={view === 'home' ? 'page' : 'false'} onClick={() => choose(onHome)}>首页</button></li>
        <li><button className={view === 'workspace' ? 'active' : undefined} type="button" disabled={disabled} aria-current={view === 'workspace' ? 'page' : 'false'} onClick={() => choose(onArticle)}>写作</button></li>
        <li><button className={view === 'dashboard' ? 'active' : undefined} type="button" disabled={disabled} aria-current={view === 'dashboard' ? 'page' : 'false'} onClick={() => choose(onDashboard)}>草稿</button></li>
        <li><button className={view === 'works' ? 'active' : undefined} type="button" disabled={disabled} aria-current={view === 'works' ? 'page' : 'false'} onClick={() => choose(onWorks)}>作品</button></li>
        <li className="imx-dock__menu-outline" aria-hidden="true" />
      </ul>
      <div className="imx-dock__actions" data-shared-dock="right">
        <button className="imx-dock__theme" data-shared-dock="action-control" type="button" disabled={disabled} aria-label={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'} title={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'} onClick={onToggleTheme}>{theme === 'light'
            ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 15.2A8.6 8.6 0 0 1 8.8 3.8 8.6 8.6 0 1 0 20.2 15.2Z" /></svg>
            : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>}</button>
        <button className={`imx-dock__menu-toggle${menuOpen ? ' active' : ''}`} data-shared-dock="action-control" type="button" aria-label={menuOpen ? '关闭菜单' : '打开菜单'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <span className="imx-dock__menu-icon" aria-hidden="true">
            <svg className="imx-dock__menu-icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <svg className="imx-dock__menu-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </span>
        </button>
      </div>
    </div>
  </nav>
}

import { useEffect, useRef, useState } from 'react'
import { ImxLogo } from './ImxLogo'
import { useLiquidIndicator } from './use-liquid-indicator'
import { useSharedDock } from './use-shared-dock'
import type { AppTheme } from './theme-preference'
import { SettingsDialog } from './SettingsDialog'
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
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

  return <><nav ref={navRef} className="imx-dock has-shared-dock" aria-label="Studio 导航">
    <div className="imx-dock__container" data-shared-dock="container">
      <span className="imx-dock__shell" data-shared-dock="shell" aria-hidden="true" />
      <button className="imx-dock__brand imx-dock__brand-default-logo" data-shared-dock="left" type="button" disabled={disabled} aria-label="I M P S，返回首页" onClick={onHome}>
        <ImxLogo />
        <span className="imx-dock__brand-title">I M P S</span>
      </button>
      <h1 className="visually-hidden">I M P S</h1>
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
        <button ref={settingsTriggerRef} className="imx-dock__settings" type="button" disabled={disabled} aria-label="打开设置" title="设置" onClick={() => { setMenuOpen(false); setSettingsOpen(true) }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.36.7.66.96.3.25.68.4 1.08.4H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></svg></button>
        <button className={`imx-dock__menu-toggle${menuOpen ? ' active' : ''}`} data-shared-dock="action-control" type="button" aria-label={menuOpen ? '关闭菜单' : '打开菜单'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <span className="imx-dock__menu-icon" aria-hidden="true">
            <svg className="imx-dock__menu-icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <svg className="imx-dock__menu-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </span>
        </button>
      </div>
    </div>
  </nav>
  {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} returnFocus={() => settingsTriggerRef.current} /> : null}</>
}

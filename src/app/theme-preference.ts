export type AppTheme = 'light' | 'dark'

const THEME_KEY = 'imx-post-studio-theme'

export function readThemePreference(): AppTheme | undefined {
  const value = window.localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' ? value : undefined
}

export function resolveInitialTheme(): AppTheme {
  return readThemePreference()
    ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme === 'light' ? 'only light' : 'dark'

  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'color-scheme'
    document.head.append(meta)
  }
  meta.content = theme === 'light' ? 'only light' : 'dark'
}

export function writeThemePreference(theme: AppTheme): void {
  window.localStorage.setItem(THEME_KEY, theme)
}

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
}

export function writeThemePreference(theme: AppTheme): void {
  window.localStorage.setItem(THEME_KEY, theme)
}

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
  const lockedColorScheme = theme === 'light' ? 'only light' : 'only dark'
  const colorScheme = globalThis.CSS?.supports?.('color-scheme', lockedColorScheme) ? lockedColorScheme : theme
  const backgroundColor = theme === 'light' ? '#f2efe8' : '#171716'
  document.documentElement.style.colorScheme = colorScheme
  document.documentElement.style.backgroundColor = backgroundColor
  document.body.style.backgroundColor = backgroundColor

  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'color-scheme'
    document.head.append(meta)
  }
  meta.content = colorScheme

  let legacyMeta = document.head.querySelector<HTMLMetaElement>('meta[name="supported-color-schemes"]')
  if (!legacyMeta) {
    legacyMeta = document.createElement('meta')
    legacyMeta.name = 'supported-color-schemes'
    document.head.append(legacyMeta)
  }
  legacyMeta.content = colorScheme
}

export function writeThemePreference(theme: AppTheme): void {
  window.localStorage.setItem(THEME_KEY, theme)
}

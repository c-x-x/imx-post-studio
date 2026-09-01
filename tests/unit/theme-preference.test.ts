import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readThemePreference, resolveInitialTheme, writeThemePreference } from '../../src/app/theme-preference'

const key = 'imx-post-studio-theme'

describe('Studio theme preference', () => {
  afterEach(() => {
    window.localStorage.removeItem(key)
    document.documentElement.removeAttribute('data-theme')
    vi.unstubAllGlobals()
  })

  it('uses the system theme until a valid manual preference exists', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    expect(resolveInitialTheme()).toBe('dark')

    window.localStorage.setItem(key, 'invalid')
    expect(readThemePreference()).toBeUndefined()

    writeThemePreference('light')
    expect(readThemePreference()).toBe('light')
    expect(resolveInitialTheme()).toBe('light')
  })

  it('applies the resolved theme to the document root', () => {
    applyTheme('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})

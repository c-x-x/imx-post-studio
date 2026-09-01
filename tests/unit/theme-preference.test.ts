import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readThemePreference, resolveInitialTheme, writeThemePreference } from '../../src/app/theme-preference'

const key = 'imx-post-studio-theme'

describe('Studio theme preference', () => {
  afterEach(() => {
    window.localStorage.removeItem(key)
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
    document.documentElement.style.backgroundColor = ''
    document.body.style.backgroundColor = ''
    document.head.querySelector('meta[name="color-scheme"]')?.remove()
    document.head.querySelector('meta[name="supported-color-schemes"]')?.remove()
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
    vi.stubGlobal('CSS', { supports: vi.fn().mockReturnValue(true) })

    applyTheme('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement.style.colorScheme).toBe('only dark')
    expect(document.documentElement.style.backgroundColor).toBe('rgb(23, 23, 22)')
    expect(document.body.style.backgroundColor).toBe('rgb(23, 23, 22)')
    expect(document.head.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'only dark')
    expect(document.head.querySelector('meta[name="supported-color-schemes"]')).toHaveAttribute('content', 'only dark')

    applyTheme('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement.style.colorScheme).toBe('only light')
    expect(document.documentElement.style.backgroundColor).toBe('rgb(242, 239, 232)')
    expect(document.body.style.backgroundColor).toBe('rgb(242, 239, 232)')
    expect(document.head.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'only light')
    expect(document.head.querySelector('meta[name="supported-color-schemes"]')).toHaveAttribute('content', 'only light')
  })

  it('falls back to the plain theme when the browser rejects locked color-scheme values', () => {
    vi.stubGlobal('CSS', { supports: vi.fn().mockReturnValue(false) })

    applyTheme('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.head.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'light')
  })
})

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewFrame } from '../../src/preview/PreviewFrame'
import { buildPreviewDocument } from '../../src/preview/build-preview-document'
import type { ArticleMeta } from '../../src/metadata/article'

const meta: ArticleMeta = {
  title: 'A <title>', slug: 'a-title', date: '2026-08-04T16:00:00+08:00', draft: true,
  categories: ['Notes'], tags: ['Safe'], description: '', toc: true,
}

afterEach(cleanup)

describe('PreviewFrame', () => {
  it('keeps accessible controls outside a script-free Shadow DOM preview and changes preview geometry', () => {
    const onClose = vi.fn()
    const onThemeChange = vi.fn()
    render(<PreviewFrame meta={meta} rendered={{ html: '<h2 id="imx-heading-a">A</h2>', toc: [], wordCount: 120, readingMinutes: 1 }} css={'body { color: red; }'} theme="dark" onThemeChange={onThemeChange} onClose={onClose} />)

    const close = screen.getByRole('button', { name: '返回编辑' })
    const mobile = screen.getByRole('button', { name: '移动预览' })
    const desktop = screen.getByRole('button', { name: '桌面预览' })
    const preview = screen.getByTitle('IMX 文章预览')
    expect(screen.getByRole('button', { name: '浅色预览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '深色预览' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('约 120 字，预计 1 分钟阅读')).toBeInTheDocument()
    expect(preview.tagName).toBe('DIV')
    expect(preview).toHaveAttribute('role', 'document')
    expect(preview.shadowRoot?.innerHTML).toContain('&lt;title&gt;')
    expect(preview.shadowRoot?.querySelector('.preview-html')).toHaveAttribute('data-theme', 'dark')
    expect(preview.shadowRoot?.querySelector('script')).toBeNull()
    expect(screen.getByLabelText('文章预览画布')).toHaveAttribute('tabindex', '0')
    expect(desktop).toHaveAttribute('aria-pressed', 'true')
    expect(preview).toHaveStyle({ width: 'min(1180px, 100%)' })

    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '浅色预览' }))
    expect(onThemeChange).toHaveBeenCalledWith('light')

    fireEvent.click(mobile)
    expect(mobile).toHaveAttribute('aria-pressed', 'true')
    expect(desktop).toHaveAttribute('aria-pressed', 'false')
    expect(preview).toHaveStyle({ width: 'min(390px, 100%)' })
    expect(preview.shadowRoot?.querySelector('.preview-html')).toHaveAttribute('data-preview-viewport', 'mobile')
  })

  it('builds sanitized Shadow DOM content with the Studio-owned TOC contract', () => {
    const content = buildPreviewDocument({
      meta,
      rendered: { html: '<h2 id="imx-heading-a">A</h2>', toc: [{ id: 'imx-heading-a', depth: 2, text: 'A', children: [] }], wordCount: 1, readingMinutes: 1 },
      css: 'body {}', theme: 'light',
    })

    expect(content).toContain('class="preview-html" data-theme="light"')
    expect(content).toContain('class="preview-body is-article-page"')
    expect(content).toContain('class="preview-symbols" style="display:none"')
    expect(content).toContain('.preview-html[data-theme="light"] .article-page { --article-ink-muted: #746c62; }')
    expect(content).toContain('<aside class="sidebar" id="article-toc" aria-label="文章目录">')
    expect(content).toContain('<div class="toc"><h3 class="toc-title">目录</h3><nav aria-label="文章目录"><ul>')
    expect(content).toContain('<div class="article-tools-actions"><label class="toc-toggle-control"><input class="toc-toggle-input" type="checkbox"')
    expect(content).toContain('aria-label="目录" aria-controls="article-toc"')
    expect(content).toContain('href="#imx-heading-a"')
    expect(content).not.toMatch(/<(?:html|body|script)\b/i)
  })

  it('keeps the mobile preview table of contents populated when opened', () => {
    render(<PreviewFrame
      meta={meta}
      rendered={{ html: '<h2 id="imx-heading-a">A</h2>', toc: [{ id: 'imx-heading-a', depth: 2, text: 'A', children: [] }], wordCount: 1, readingMinutes: 1 }}
      css="body {}"
      theme="light"
      onThemeChange={vi.fn()}
      onClose={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: '移动预览' }))
    const preview = screen.getByTitle('IMX 文章预览')
    const root = preview.shadowRoot
    const input = root?.querySelector<HTMLInputElement>('.toc-toggle-input')
    const tools = root?.querySelector<HTMLElement>('.article-tools')
    const sidebar = root?.querySelector<HTMLElement>('.sidebar')
    expect(root?.querySelector('.preview-html')).toHaveAttribute('data-preview-viewport', 'mobile')
    expect(root?.querySelector('.toc nav')).toHaveTextContent('A')

    expect(input).not.toBeNull()
    fireEvent.click(root!.querySelector<HTMLElement>('.sidebar-toggle')!)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(tools).toHaveClass('is-toc-open')
    expect(sidebar).toHaveClass('active')
    expect(sidebar).toHaveTextContent('A')
  })

})

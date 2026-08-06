import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PreviewFrame } from '../../src/preview/PreviewFrame'
import { buildPreviewDocument } from '../../src/preview/build-preview-document'
import type { ArticleMeta } from '../../src/metadata/article'

const meta: ArticleMeta = {
  title: 'A <title>', slug: 'a-title', date: '2026-08-04T16:00:00+08:00', draft: true,
  categories: ['Notes'], tags: ['Safe'], description: '', toc: true,
}

describe('PreviewFrame', () => {
  it('exposes the shared Dock structure and an element scroll source', () => {
    const { container, unmount } = render(<PreviewFrame meta={meta} rendered={{ html: '', toc: [], wordCount: 0, readingMinutes: 0 }} css="" theme="light" onThemeChange={vi.fn()} onClose={vi.fn()} />)
    const surface = container.querySelector('.preview-surface')
    const dock = container.querySelector('.preview-dock')

    expect(surface).toHaveAttribute('data-shared-dock-scroll')
    expect(dock).toHaveClass('has-shared-dock')
    for (const role of ['container', 'shell', 'left', 'center', 'right', 'action-control']) {
      expect(dock?.querySelector(`[data-shared-dock="${role}"]`)).toBeInTheDocument()
    }
    unmount()
  })

  it('keeps accessible controls outside a fully sandboxed, script-free IMX iframe and changes preview geometry', () => {
    const onClose = vi.fn()
    const onThemeChange = vi.fn()
    render(<PreviewFrame meta={meta} rendered={{ html: '<h2 id="imx-heading-a">A</h2>', toc: [], wordCount: 120, readingMinutes: 1 }} css={'body { color: red; }'} theme="dark" onThemeChange={onThemeChange} onClose={onClose} />)

    const close = screen.getByRole('button', { name: '返回编辑' })
    const mobile = screen.getByRole('button', { name: '移动预览' })
    const desktop = screen.getByRole('button', { name: '桌面预览' })
    const iframe = screen.getByTitle('IMX 文章预览')
    expect(screen.getByRole('button', { name: '浅色预览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '深色预览' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('约 120 字，预计 1 分钟阅读')).toBeInTheDocument()
    expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(iframe.getAttribute('srcdoc')).toContain('&lt;title&gt;')
    expect(iframe.getAttribute('srcdoc')).toContain('data-theme="dark"')
    expect(iframe.getAttribute('srcdoc')).not.toMatch(/<script/i)
    expect(screen.getByLabelText('预览画布，可水平滚动')).toHaveAttribute('tabindex', '0')
    expect(desktop).toHaveAttribute('aria-pressed', 'true')
    expect(iframe).toHaveStyle({ width: '1180px' })

    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '浅色预览' }))
    expect(onThemeChange).toHaveBeenCalledWith('light')

    fireEvent.click(mobile)
    expect(mobile).toHaveAttribute('aria-pressed', 'true')
    expect(desktop).toHaveAttribute('aria-pressed', 'false')
    expect(iframe).toHaveStyle({ width: '390px' })
  })

  it('uses the vendored TOC nav and toggle contract in a script-free document', () => {
    const document = buildPreviewDocument({
      meta,
      rendered: { html: '<h2 id="imx-heading-a">A</h2>', toc: [{ id: 'imx-heading-a', depth: 2, text: 'A', children: [] }], wordCount: 1, readingMinutes: 1 },
      css: 'body {}', theme: 'light',
    })

    expect(document).toContain('class="preview-symbols" style="display:none"')
    expect(document).toContain(':root[data-theme="light"] .article-page { --article-ink-muted: #746c62; }')
    expect(document).toContain('<aside class="sidebar" id="article-toc" aria-label="文章目录">')
    expect(document).toContain('<div class="toc"><h3 class="toc-title">目录</h3><nav aria-label="文章目录"><ul>')
    expect(document).toContain('<div class="article-tools-actions"><label class="toc-toggle-control"><input class="toc-toggle-input" type="checkbox"')
    expect(document).toContain('aria-label="目录" aria-controls="article-toc"')
    expect(document).toContain('href="about:srcdoc#imx-heading-a"')
  })

  it('keeps Studio preview behavior overrides without replacing the vendored dark palette', () => {
    const document = buildPreviewDocument({
      meta,
      rendered: { html: '<p>正文</p>', toc: [{ id: 'a', depth: 2, text: 'A', children: [] }], wordCount: 2, readingMinutes: 1 },
      css: 'body { color: red; }',
      theme: 'dark',
    })

    expect(document).toContain('--preview-page-bg: #171716')
    expect(document).not.toContain('--article-ink: #e3dcd2')
    expect(document).not.toContain('--article-ink-muted: #b7aea2')
    expect(document).not.toContain('--preview-toc-ink: #c8bfb3')
    expect(document).toContain('body.is-article-page')
    expect(document).toContain("html::-webkit-scrollbar")
    expect(document).toContain('.toc-toggle-input')
    expect(document.lastIndexOf('--preview-page-bg')).toBeGreaterThan(document.lastIndexOf('body { color: red; }'))
  })
})

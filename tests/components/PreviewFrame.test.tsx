import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewFrame } from '../../src/preview/PreviewFrame'
import { buildPreviewDocument } from '../../src/preview/build-preview-document'
import type { ArticleMeta } from '../../src/metadata/article'

const meta: ArticleMeta = {
  title: 'A <title>', slug: 'a-title', date: '2026-08-04T16:00:00+08:00', draft: true,
  categories: ['Notes'], tags: ['Safe'], description: '', featured: false, toc: true,
}

afterEach(cleanup)

describe('PreviewFrame', () => {
  it('keeps the shared theme control outside a script-free responsive Shadow DOM preview', () => {
    const onClose = vi.fn()
    const onToggleTheme = vi.fn()
    render(<PreviewFrame meta={meta} rendered={{ html: '<h2 id="imx-heading-a">A</h2>', toc: [], wordCount: 120, readingMinutes: 1 }} css={'body { color: red; }'} theme="dark" onToggleTheme={onToggleTheme} onClose={onClose} />)

    const close = screen.getByRole('button', { name: '返回编辑' })
    const preview = screen.getByTitle('IMX 文章预览')
    expect(screen.getByRole('button', { name: '切换到浅色主题' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移动预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '桌面预览' })).not.toBeInTheDocument()
    expect(screen.getByText('约 120 字，预计 1 分钟阅读')).toBeInTheDocument()
    expect(preview.tagName).toBe('DIV')
    expect(preview).toHaveAttribute('role', 'document')
    expect(preview.shadowRoot?.innerHTML).toContain('&lt;title&gt;')
    expect(preview.shadowRoot?.querySelector('.preview-html')).toHaveAttribute('data-theme', 'dark')
    expect(preview.shadowRoot?.querySelector('script')).toBeNull()
    expect(screen.getByLabelText('文章预览画布')).toHaveAttribute('tabindex', '0')
    expect(preview).toHaveStyle({ width: 'min(1180px, 100%)' })

    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '切换到浅色主题' }))
    expect(onToggleTheme).toHaveBeenCalledOnce()
  })

  it('navigates body and footnote anchors inside the preview without leaving the editor', () => {
    render(<PreviewFrame meta={meta} rendered={{ html: '<a href="#imx-heading-a">跳转正文</a><h2 id="imx-heading-a">A</h2><a href="#fn-1">脚注</a><p id="fn-1">注释</p>', toc: [], wordCount: 1, readingMinutes: 1 }} css="" theme="light" onToggleTheme={vi.fn()} onClose={vi.fn()} />)
    const root = screen.getByTitle('IMX 文章预览').shadowRoot!
    const scroll = vi.fn()
    screen.getByTitle('IMX 文章预览').scrollTo = scroll
    for (const link of root.querySelectorAll('.article-content a')) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      fireEvent(link, event)
      expect(event.defaultPrevented).toBe(true)
    }
    expect(scroll).toHaveBeenCalledTimes(2)
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

  it('keeps the responsive preview table of contents populated when opened', () => {
    render(<PreviewFrame
      meta={meta}
      rendered={{ html: '<h2 id="imx-heading-a">A</h2>', toc: [{ id: 'imx-heading-a', depth: 2, text: 'A', children: [] }], wordCount: 1, readingMinutes: 1 }}
      css="body {}"
      theme="light"
      onToggleTheme={vi.fn()}
      onClose={vi.fn()}
    />)

    const preview = screen.getByTitle('IMX 文章预览')
    const root = preview.shadowRoot
    const input = root?.querySelector<HTMLInputElement>('.toc-toggle-input')
    const tools = root?.querySelector<HTMLElement>('.article-tools')
    const sidebar = root?.querySelector<HTMLElement>('.sidebar')
    expect(root?.querySelector('.toc nav')).toHaveTextContent('A')

    expect(input).not.toBeNull()
    fireEvent.click(root!.querySelector<HTMLElement>('.sidebar-toggle')!)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(tools).toHaveClass('is-toc-open')
    expect(sidebar).toHaveClass('active')
    expect(sidebar).toHaveTextContent('A')
  })

})

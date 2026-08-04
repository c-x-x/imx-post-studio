import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PreviewFrame } from '../../src/preview/PreviewFrame'
import { buildPreviewDocument } from '../../src/preview/build-preview-document'
import type { ArticleMeta } from '../../src/metadata/article'

const meta: ArticleMeta = {
  title: 'A <title>', slug: 'a-title', date: '2026-08-04T16:00:00+08:00', draft: true,
  categories: ['Notes'], tags: ['Safe'], description: '', toc: true,
}

describe('PreviewFrame', () => {
  it('keeps accessible controls outside a fully sandboxed, script-free IMX iframe and changes preview geometry', () => {
    render(<PreviewFrame meta={meta} rendered={{ html: '<h2 id="imx-heading-a">A</h2>', toc: [], wordCount: 120, readingMinutes: 1 }} css={'body { color: red; }'} />)

    const mobile = screen.getByRole('button', { name: '移动预览' })
    const desktop = screen.getByRole('button', { name: '桌面预览' })
    const iframe = screen.getByTitle('IMX 文章预览')
    expect(screen.getByRole('button', { name: '浅色预览' })).toBeInTheDocument()
    expect(screen.getByText('约 120 字，预计 1 分钟阅读')).toBeInTheDocument()
    expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(iframe.getAttribute('srcdoc')).toContain('&lt;title&gt;')
    expect(iframe.getAttribute('srcdoc')).not.toMatch(/<script/i)
    expect(screen.getByLabelText('预览画布，可水平滚动')).toHaveAttribute('tabindex', '0')
    expect(desktop).toHaveAttribute('aria-pressed', 'true')
    expect(iframe).toHaveStyle({ width: '1180px' })

    fireEvent.click(mobile)
    expect(mobile).toHaveAttribute('aria-pressed', 'true')
    expect(desktop).toHaveAttribute('aria-pressed', 'false')
    expect(iframe).toHaveStyle({ width: '390px' })
  })

  it('uses the vendored TOC nav contract with an always reachable script-free sidebar', () => {
    const document = buildPreviewDocument({
      meta,
      rendered: { html: '<h2 id="imx-heading-a">A</h2>', toc: [{ id: 'imx-heading-a', depth: 2, text: 'A', children: [] }], wordCount: 1, readingMinutes: 1 },
      css: 'body {}', theme: 'light',
    })

    expect(document).toContain('class="preview-symbols" style="display:none"')
    expect(document).toContain(':root[data-theme="light"] .article-page { --article-ink-muted: #746c62; }')
    expect(document).toContain('<aside class="sidebar active" id="article-toc" aria-label="文章目录">')
    expect(document).toContain('<div class="toc"><h3 class="toc-title">目录</h3><nav aria-label="文章目录"><ul>')
  })
})

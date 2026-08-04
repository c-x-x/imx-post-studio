import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PreviewFrame } from '../../src/preview/PreviewFrame'
import type { ArticleMeta } from '../../src/metadata/article'

const meta: ArticleMeta = {
  title: 'A <title>',
  slug: 'a-title',
  date: '2026-08-04T16:00:00+08:00',
  draft: true,
  categories: ['Notes'],
  tags: ['Safe'],
  description: '',
  toc: true,
}

describe('PreviewFrame', () => {
  it('keeps accessible controls outside a fully sandboxed, script-free IMX iframe', () => {
    render(
      <PreviewFrame
        meta={meta}
        rendered={{ html: '<h1 id="a">A</h1>', toc: [], wordCount: 120, readingMinutes: 1 }}
        css={'body { color: red; }'}
      />,
    )

    expect(screen.getByRole('button', { name: '浅色预览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '桌面预览' })).toBeInTheDocument()
    expect(screen.getByText('约 120 字，预计 1 分钟阅读')).toBeInTheDocument()
    const iframe = screen.getByTitle('IMX 文章预览')
    expect(iframe).toHaveAttribute('sandbox', '')
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(iframe.getAttribute('srcdoc')).toContain('&lt;title&gt;')
    expect(iframe.getAttribute('srcdoc')).not.toMatch(/<script/i)
  })
})

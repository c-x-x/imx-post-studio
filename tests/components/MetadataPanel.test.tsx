import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { ArticleMeta } from '../../src/metadata/article'
import { MetadataPanel } from '../../src/metadata/MetadataPanel'

function MetadataHarness() {
  const [meta, setMeta] = useState<ArticleMeta>({
    title: '', slug: 'manual-slug', date: '2026-08-04T09:00:00+08:00', draft: true,
    categories: [], tags: [], description: '', toc: true,
  })
  return <MetadataPanel meta={meta} onChange={(field, value) => setMeta((current) => ({ ...current, [field]: value }))} />
}

describe('MetadataPanel', () => {
  afterEach(cleanup)

  it('keeps a manual slug while a Chinese title changes, then applies pinyin only on explicit request', async () => {
    const user = userEvent.setup()
    render(<MetadataHarness />)

    await user.type(screen.getByLabelText('标题'), 'Hugo 图片处理指南')
    expect(screen.getByLabelText('Slug')).toHaveValue('manual-slug')

    await user.click(screen.getByRole('button', { name: '生成拼音 Slug' }))
    expect(screen.getByLabelText('Slug')).toHaveValue('hugo-tu-pian-chu-li-zhi-nan')
  })

  it('provides labeled metadata controls, editable category/tag chips, and inline slug feedback', async () => {
    const user = userEvent.setup()
    render(<MetadataHarness />)

    expect(screen.queryByRole('checkbox', { name: /^草稿$/ })).not.toBeInTheDocument()
    for (const label of ['标题', 'Slug', '发布日期', '摘要', '分类', '标签', '显示目录']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }

    await user.type(screen.getByLabelText('分类'), '技术{Enter}')
    await user.type(screen.getByLabelText('标签'), 'IMX{Enter}')
    expect(screen.getByRole('button', { name: '移除分类 技术' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除标签 IMX' })).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Slug'))
    await user.type(screen.getByLabelText('Slug'), 'Invalid slug')
    expect(screen.getByText('Slug 只能包含小写英文、数字和单个连字符')).toBeInTheDocument()
  })

  it('marks a non-canonical date invalid and associates its live validation message', async () => {
    const user = userEvent.setup()
    render(<MetadataHarness />)

    await user.clear(screen.getByLabelText('发布日期'))
    await user.type(screen.getByLabelText('发布日期'), '2026/08/04')
    expect(screen.getByLabelText('发布日期')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('date 必须是规范的 +08:00 RFC 3339 日期时间')).toHaveAttribute('aria-live', 'polite')
  })

  it('rejects impossible calendar dates but accepts leap-day +08:00 values', async () => {
    const user = userEvent.setup()
    render(<MetadataHarness />)

    const date = screen.getByLabelText('发布日期')
    await user.clear(date)
    await user.type(date, '2026-02-30T09:00:00+08:00')
    expect(date).toHaveAttribute('aria-invalid', 'true')

    await user.clear(date)
    await user.type(date, '2024-02-29T09:00:00+08:00')
    expect(date).toHaveAttribute('aria-invalid', 'false')
  })
})

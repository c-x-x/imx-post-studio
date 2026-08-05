import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { renderMarkdown, list } = vi.hoisted(() => ({ renderMarkdown: vi.fn(), list: vi.fn() }))
vi.mock('../../src/preview/markdown', () => ({ renderMarkdown }))
vi.mock('../../src/drafts/repository', () => ({
  draftRepository: { put: vi.fn(), list, get: vi.fn(), duplicate: vi.fn(), rename: vi.fn(), delete: vi.fn() },
}))

import { App } from '../../src/app/App'

describe('preview failure recovery', () => {
  afterEach(cleanup)

  it('announces a current preview rendering failure instead of leaving an unhandled rejection', async () => {
    const user = userEvent.setup()
    list.mockResolvedValue([])
    renderMarkdown.mockRejectedValueOnce(new Error('renderer failed'))
    render(<App />)

    expect(renderMarkdown).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '新建文章' }))
    await user.click(screen.getByRole('button', { name: '预览文章' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('预览更新失败：renderer failed')
  })
})

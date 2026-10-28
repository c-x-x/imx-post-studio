import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createArticleDraft } from '../../src/metadata/article'

const { listDrafts, deleteDraft, listOrigins, deleteOrigin } = vi.hoisted(() => ({
  listDrafts: vi.fn(), deleteDraft: vi.fn(), listOrigins: vi.fn(), deleteOrigin: vi.fn(),
}))
vi.mock('../../src/drafts/repository', () => ({ draftRepository: { list: listDrafts, delete: deleteDraft } }))
vi.mock('../../src/github/origins', () => ({ githubOrigins: { list: listOrigins, delete: deleteOrigin } }))
import { DraftDashboard } from '../../src/drafts/DraftDashboard'

beforeEach(() => {
  vi.resetAllMocks()
  listOrigins.mockResolvedValue(new Map())
  deleteDraft.mockResolvedValue(undefined)
  deleteOrigin.mockResolvedValue(undefined)
})
afterEach(cleanup)

it('clears the active draft and reports cleanup failure after its deletion succeeds', async () => {
  const draft = createArticleDraft()
  draft.meta.title = '正在编辑的草稿'
  listDrafts.mockResolvedValue([draft])
  deleteOrigin.mockRejectedValue(new Error('关联数据库不可用'))
  const onDelete = vi.fn()
  render(<DraftDashboard activeDraftId={draft.id} onOpen={() => undefined} onDelete={onDelete} />)

  fireEvent.click(await screen.findByRole('button', { name: '删除' }))
  const dialog = screen.getByRole('dialog', { name: '删除草稿？' })
  fireEvent.click(within(dialog).getByRole('button', { name: '删除草稿' }))

  await waitFor(() => expect(onDelete).toHaveBeenCalledWith(draft.id))
  expect(screen.queryByRole('dialog', { name: '删除草稿？' })).not.toBeInTheDocument()
  expect(screen.queryByText('正在编辑的草稿')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('草稿已删除')
  expect(screen.getByRole('alert')).toHaveTextContent('关联数据库不可用')
})

it('keeps the active draft and allows retry when deleting it fails', async () => {
  const draft = createArticleDraft()
  draft.meta.title = '需要保留的草稿'
  listDrafts.mockResolvedValue([draft])
  deleteDraft.mockRejectedValue(new Error('数据库不可用'))
  const onDelete = vi.fn()
  render(<DraftDashboard activeDraftId={draft.id} onOpen={() => undefined} onDelete={onDelete} />)
  fireEvent.click(await screen.findByRole('button', { name: '删除' }))
  const dialog = screen.getByRole('dialog', { name: '删除草稿？' })
  fireEvent.click(within(dialog).getByRole('button', { name: '删除草稿' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('删除草稿失败：数据库不可用')
  expect(within(dialog).getByRole('button', { name: '删除草稿' })).toBeEnabled()
  expect(onDelete).not.toHaveBeenCalled()
  expect(deleteOrigin).not.toHaveBeenCalled()
})

it('does not start a duplicate deletion while the first is pending', async () => {
  const draft = createArticleDraft()
  draft.meta.title = '草稿'
  listDrafts.mockResolvedValue([draft])
  let finish!: () => void
  deleteDraft.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
  const onDelete = vi.fn()
  render(<DraftDashboard activeDraftId={draft.id} onOpen={() => undefined} onDelete={onDelete} />)
  fireEvent.click(await screen.findByRole('button', { name: '删除' }))
  const button = within(screen.getByRole('dialog', { name: '删除草稿？' })).getByRole('button', { name: '删除草稿' })
  fireEvent.click(button)
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(deleteDraft).toHaveBeenCalledTimes(1)
  finish()
  await waitFor(() => expect(onDelete).toHaveBeenCalledWith(draft.id))
})

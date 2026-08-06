import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../src/metadata/article'
import { CoverPanel } from '../../src/media/CoverPanel'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const cover: MediaAsset = { id: 'cover', name: 'cover.webp', kind: 'cover', mime: 'image/webp', blob: new Blob() }

describe('CoverPanel', () => {
  afterEach(cleanup)

  it('owns the current cover and removes it directly', () => {
    const onRemove = vi.fn()
    render(<CoverPanel cover={cover} onReplace={vi.fn()} onRemove={onRemove} />)

    expect(screen.getByRole('heading', { name: '文章封面' })).toBeInTheDocument()
    expect(screen.getByLabelText('选择封面')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(screen.getByLabelText('当前封面')).toHaveTextContent('封面')
    fireEvent.click(screen.getByRole('button', { name: '删除封面' }))
    expect(onRemove).toHaveBeenCalledWith('cover')
  })

  it('drops delayed cover validation after its draft changes', async () => {
    let resolveRead: ((value: ArrayBuffer) => void) | undefined
    const delayed = new File([png], 'cover.png', { type: 'image/png' })
    Object.defineProperty(delayed, 'arrayBuffer', {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve }),
    })
    const onIntakeBusyChange = vi.fn()
    const props = { cover: undefined, onReplace: vi.fn(), onRemove: vi.fn(), onIntakeBusyChange }
    const { rerender } = render(<CoverPanel draftId="old" {...props} />)
    fireEvent.change(screen.getByLabelText('选择封面'), { target: { files: [delayed] } })
    expect(onIntakeBusyChange).toHaveBeenLastCalledWith(true)

    rerender(<CoverPanel draftId="new" {...props} />)
    await act(async () => { resolveRead?.(png.buffer) })
    await waitFor(() => expect(onIntakeBusyChange).toHaveBeenLastCalledWith(false))
    expect(screen.queryByRole('dialog', { name: '裁剪封面' })).not.toBeInTheDocument()
  })

  it('clears delayed cover intake when unmounted', async () => {
    let resolveRead: ((value: ArrayBuffer) => void) | undefined
    const delayed = new File([png], 'cover.png', { type: 'image/png' })
    Object.defineProperty(delayed, 'arrayBuffer', {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve }),
    })
    const onIntakeBusyChange = vi.fn()
    const { unmount } = render(<CoverPanel draftId="old" cover={undefined} onReplace={vi.fn()} onRemove={vi.fn()} onIntakeBusyChange={onIntakeBusyChange} />)
    fireEvent.change(screen.getByLabelText('选择封面'), { target: { files: [delayed] } })
    unmount()
    await act(async () => { resolveRead?.(png.buffer) })
    expect(onIntakeBusyChange).toHaveBeenLastCalledWith(false)
  })
})

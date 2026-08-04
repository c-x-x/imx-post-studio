import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../src/metadata/article'
import { MediaPanel } from '../../src/media/MediaPanel'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])

function Harness() {
  const [media, setMedia] = useState<MediaAsset[]>([])
  return <MediaPanel media={media} body="" onAddBatch={(assets) => setMedia((current) => [...current, ...assets])} onReplaceCover={vi.fn()} onRemove={(id) => setMedia((current) => current.filter((asset) => asset.id !== id))} onInsertImage={vi.fn()} />
}

describe('MediaPanel intake', () => {
  afterEach(cleanup)

  it('commits no portion of an invalid multi-file selection', async () => {
    render(<Harness />)
    const input = screen.getByLabelText('添加正文图片')
    fireEvent.change(input, { target: { files: [new File([png], 'valid.png', { type: 'image/png' }), new File(['bad'], 'bad.png', { type: 'image/png' })] } })

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('图片'))
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('serializes concurrent selections and keeps reserved cover names unique', async () => {
    render(<Harness />)
    const input = screen.getByLabelText('添加正文图片')
    fireEvent.change(input, { target: { files: [new File([webp], 'cover.webp', { type: 'image/webp' })] } })
    fireEvent.change(input, { target: { files: [new File([webp], 'cover.webp', { type: 'image/webp' })] } })

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(screen.getByRole('listitem', { name: 'cover-2.webp' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'cover-3.webp' })).toBeInTheDocument()
  })

  it('drops an old asynchronous intake after its draft generation changes, then accepts a new batch', async () => {
    let resolveRead: ((value: ArrayBuffer) => void) | undefined
    const delayed = new File([png], 'old.png', { type: 'image/png' })
    Object.defineProperty(delayed, 'arrayBuffer', {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve }),
    })
    const onAddBatch = vi.fn()
    const props = {
      media: [], body: '', onAddBatch, onReplaceCover: vi.fn(), onRemove: vi.fn(), onInsertImage: vi.fn(),
    }
    const { rerender } = render(<MediaPanel draftId="old" {...props} />)
    fireEvent.change(screen.getByLabelText('添加正文图片'), { target: { files: [delayed] } })
    await act(async () => { await Promise.resolve() })
    rerender(<MediaPanel draftId="new" {...props} />)
    await act(async () => { resolveRead?.(png.buffer) })
    expect(onAddBatch).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('添加正文图片'), { target: { files: [new File([png], 'new.png', { type: 'image/png' })] } })
    await waitFor(() => expect(onAddBatch).toHaveBeenCalledWith([expect.objectContaining({ name: 'new.png' })]))
  })

  it('does not dispatch a delayed intake after unmount', async () => {
    let resolveRead: ((value: ArrayBuffer) => void) | undefined
    const delayed = new File([png], 'old.png', { type: 'image/png' })
    Object.defineProperty(delayed, 'arrayBuffer', {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve }),
    })
    const onAddBatch = vi.fn()
    const { unmount } = render(<MediaPanel draftId="old" media={[]} body="" onAddBatch={onAddBatch} onReplaceCover={vi.fn()} onRemove={vi.fn()} onInsertImage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('添加正文图片'), { target: { files: [delayed] } })
    await act(async () => { await Promise.resolve() })
    unmount()
    await act(async () => { resolveRead?.(png.buffer) })
    expect(onAddBatch).not.toHaveBeenCalled()
  })

  it('treats delayed cover validation as draft-scoped intake work', async () => {
    let resolveRead: ((value: ArrayBuffer) => void) | undefined
    const delayed = new File([png], 'cover.png', { type: 'image/png' })
    Object.defineProperty(delayed, 'arrayBuffer', {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve }),
    })
    const onIntakeBusyChange = vi.fn()
    const props = {
      media: [], body: '', onAddBatch: vi.fn(), onReplaceCover: vi.fn(), onRemove: vi.fn(), onInsertImage: vi.fn(), onIntakeBusyChange,
    }
    const { rerender } = render(<MediaPanel draftId="old" {...props} />)
    fireEvent.change(screen.getByLabelText('选择封面'), { target: { files: [delayed] } })
    expect(onIntakeBusyChange).toHaveBeenLastCalledWith(true)

    rerender(<MediaPanel draftId="new" {...props} />)
    await act(async () => { resolveRead?.(png.buffer) })
    await waitFor(() => expect(onIntakeBusyChange).toHaveBeenLastCalledWith(false))
    expect(screen.queryByRole('dialog', { name: '裁剪封面' })).not.toBeInTheDocument()
  })

  it('clears delayed cover intake when the panel unmounts', async () => {
    let resolveRead: ((value: ArrayBuffer) => void) | undefined
    const delayed = new File([png], 'cover.png', { type: 'image/png' })
    Object.defineProperty(delayed, 'arrayBuffer', {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve }),
    })
    const onIntakeBusyChange = vi.fn()
    const { unmount } = render(<MediaPanel draftId="old" media={[]} body="" onAddBatch={vi.fn()} onReplaceCover={vi.fn()} onRemove={vi.fn()} onInsertImage={vi.fn()} onIntakeBusyChange={onIntakeBusyChange} />)
    fireEvent.change(screen.getByLabelText('选择封面'), { target: { files: [delayed] } })
    unmount()
    await act(async () => { resolveRead?.(png.buffer) })
    expect(onIntakeBusyChange).toHaveBeenLastCalledWith(false)
  })
})

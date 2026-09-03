import { createPngBuffer, tinyWebpBytes } from '../helpers/test-images'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../src/metadata/article'
import { MediaPanel } from '../../src/media/MediaPanel'

const png = new Uint8Array(createPngBuffer(1, 1))
const webp = tinyWebpBytes

function Harness() {
  const [media, setMedia] = useState<MediaAsset[]>([])
  return <MediaPanel media={media} body="" onAddBatch={(assets) => setMedia((current) => [...current, ...assets])} onRemove={(id) => setMedia((current) => current.filter((asset) => asset.id !== id))} onInsertImage={vi.fn()} />
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
      media: [], body: '', onAddBatch, onRemove: vi.fn(), onInsertImage: vi.fn(),
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
    const { unmount } = render(<MediaPanel draftId="old" media={[]} body="" onAddBatch={onAddBatch} onRemove={vi.fn()} onInsertImage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('添加正文图片'), { target: { files: [delayed] } })
    await act(async () => { await Promise.resolve() })
    unmount()
    await act(async () => { resolveRead?.(png.buffer) })
    expect(onAddBatch).not.toHaveBeenCalled()
  })

  it('exposes only body-image controls and body assets', () => {
    const cover: MediaAsset = { id: 'cover', name: 'cover.webp', kind: 'cover', mime: 'image/webp', blob: new Blob() }
    const body: MediaAsset = { id: 'body', name: 'body.webp', kind: 'body', mime: 'image/webp', blob: new Blob() }
    render(<MediaPanel media={[cover, body]} body="" onAddBatch={vi.fn()} onRemove={vi.fn()} onInsertImage={vi.fn()} />)

    expect(screen.queryByLabelText('选择封面')).not.toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'body.webp' })).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'cover.webp' })).not.toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'body.webp' }).querySelectorAll('.media-item-action')).toHaveLength(2)
  })
})

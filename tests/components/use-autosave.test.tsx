import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArticleDraft } from '../../src/metadata/article'

const { put } = vi.hoisted(() => ({ put: vi.fn() }))

vi.mock('../../src/drafts/repository', () => ({
  draftRepository: { put },
}))

import { useAutosave } from '../../src/drafts/use-autosave'

function draft(body = 'original'): ArticleDraft {
  return {
    id: 'autosave-draft',
    createdAt: '2026-08-04T09:00:00+08:00',
    updatedAt: '2026-08-04T09:00:00+08:00',
    meta: {
      title: 'Autosave draft', slug: 'autosave-draft', date: '2026-08-04T09:00:00+08:00',
      draft: true, categories: [], tags: [], description: '', toc: true,
    },
    body,
    media: [],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-04T09:00:00+08:00'))
    put.mockReset()
    put.mockResolvedValue(undefined)
  })

  afterEach(() => vi.useRealTimers())

  it('does not persist a draft without article content', async () => {
    const empty = draft('   ')
    empty.meta = {
      ...empty.meta,
      title: '',
      slug: '',
      categories: [],
      tags: [],
      description: '',
    }
    const { result } = renderHook(() => useAutosave(empty))

    await act(async () => vi.advanceTimersByTimeAsync(800))

    expect(put).not.toHaveBeenCalled()
    expect(result.current).toEqual({ state: 'idle' })
  })

  it('waits exactly 800 ms after the last content change before saving once', async () => {
    const { rerender } = renderHook(({ current }) => useAutosave(current), {
      initialProps: { current: draft() },
    })

    act(() => vi.advanceTimersByTime(500))
    rerender({ current: draft('changed after 500 ms') })
    act(() => vi.advanceTimersByTime(799))
    expect(put).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'changed after 500 ms' }))
  })

  it('does not write unnamed content and resumes only after naming it', async () => {
    const unnamed = { ...draft('正文已经写好'), meta: { ...draft().meta, title: '  ' } }
    const onSaved = vi.fn()
    const { result, rerender } = renderHook(({ current }) => useAutosave(current, onSaved), {
      initialProps: { current: unnamed },
    })
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(put).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    rerender({ current: { ...unnamed, meta: { ...unnamed.meta, title: '已命名' } } })
    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(put).toHaveBeenCalledOnce()
    expect(result.current.state).toBe('saved')
    rerender({ current: unnamed })
    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(put).toHaveBeenCalledOnce()
    expect(result.current.state).toBe('idle')
  })

  it('cancels a scheduled write when the title is removed', async () => {
    const named = draft()
    const { rerender } = renderHook(({ current }) => useAutosave(current), { initialProps: { current: named } })
    act(() => vi.advanceTimersByTime(799))
    rerender({ current: { ...named, meta: { ...named.meta, title: '' } } })
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(put).not.toHaveBeenCalled()
  })

  it('exposes saving then saved after the repository resolves', async () => {
    const save = deferred<void>()
    put.mockReturnValueOnce(save.promise)
    const current = draft()
    const { result } = renderHook(() => useAutosave(current))

    act(() => vi.advanceTimersByTime(800))
    expect(result.current).toEqual({ state: 'saving' })

    await act(async () => {
      save.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current).toEqual(expect.objectContaining({ state: 'saved', at: expect.any(String) }))
  })

  it('notifies the caller only after the current revision is stored', async () => {
    const onSaved = vi.fn()
    const current = draft('notify after save')
    renderHook(() => useAutosave(current, onSaved))

    expect(onSaved).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(800))

    expect(onSaved).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledWith(current)
  })

  it('does not report a newer revision as saved before its debounce completes', async () => {
    const { result, rerender } = renderHook(({ current }) => useAutosave(current), {
      initialProps: { current: draft('saved revision') },
    })

    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(result.current).toEqual(expect.objectContaining({ state: 'saved' }))

    rerender({ current: draft('unsaved revision') })
    expect(result.current).toEqual({ state: 'idle' })
    act(() => vi.advanceTimersByTime(799))
    expect(result.current).toEqual({ state: 'idle' })
  })

  it('retains an actionable failure while a later retry is pending, then marks recovery saved', async () => {
    const retry = deferred<void>()
    put.mockRejectedValueOnce(new Error('Quota exceeded')).mockReturnValueOnce(retry.promise)
    const { result, rerender } = renderHook(({ current }) => useAutosave(current), {
      initialProps: { current: draft() },
    })

    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(result.current).toEqual(expect.objectContaining({
      state: 'failed',
      message: expect.stringContaining('紧急导出'),
    }))

    rerender({ current: draft('recovery') })
    expect(result.current).toEqual(expect.objectContaining({ state: 'failed' }))
    act(() => vi.advanceTimersByTime(800))
    expect(result.current).toEqual(expect.objectContaining({
      state: 'failed',
      message: expect.stringContaining('紧急导出'),
    }))

    await act(async () => {
      retry.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current).toEqual(expect.objectContaining({ state: 'saved', at: expect.any(String) }))
  })

  it('ignores both a stale rejection and stale resolution after a later save', async () => {
    const staleFailure = deferred<void>()
    const staleSuccess = deferred<void>()
    put.mockReturnValueOnce(staleFailure.promise).mockReturnValueOnce(staleSuccess.promise).mockResolvedValue(undefined)
    const { result, rerender } = renderHook(({ current }) => useAutosave(current), {
      initialProps: { current: draft('first') },
    })

    act(() => vi.advanceTimersByTime(800))
    rerender({ current: draft('second') })
    act(() => vi.advanceTimersByTime(800))
    rerender({ current: draft('third') })
    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(result.current).toEqual(expect.objectContaining({ state: 'saved', at: expect.any(String) }))

    await act(async () => staleFailure.reject(new Error('old failure')))
    await act(async () => staleSuccess.resolve())
    expect(result.current).toEqual(expect.objectContaining({ state: 'saved', at: expect.any(String) }))
  })

  it('cancels pending saves when switching drafts or unmounting', () => {
    const { rerender, unmount } = renderHook(({ current }) => useAutosave(current), {
      initialProps: { current: draft('first') },
    })

    act(() => vi.advanceTimersByTime(500))
    rerender({ current: { ...draft('other'), id: 'other-draft' } })
    unmount()
    act(() => vi.advanceTimersByTime(1_000))

    expect(put).not.toHaveBeenCalled()
  })

  it('saves exactly once and settles saved under React StrictMode', async () => {
    const current = draft('strict mode')
    const { result } = renderHook(() => useAutosave(current), { wrapper: StrictMode })

    await act(async () => vi.advanceTimersByTimeAsync(800))

    expect(put).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual(expect.objectContaining({ state: 'saved', at: expect.any(String) }))
  })
})

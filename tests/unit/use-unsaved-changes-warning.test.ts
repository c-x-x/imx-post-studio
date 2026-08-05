import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useUnsavedChangesWarning } from '../../src/app/use-unsaved-changes-warning'

function dispatchBeforeUnload(): boolean {
  return window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
}

describe('useUnsavedChangesWarning', () => {
  afterEach(cleanup)

  it('prevents browser exit only while the current article has unsaved changes', () => {
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChangesWarning(dirty), {
      initialProps: { dirty: false },
    })

    expect(dispatchBeforeUnload()).toBe(true)
    rerender({ dirty: true })
    expect(dispatchBeforeUnload()).toBe(false)
    rerender({ dirty: false })
    expect(dispatchBeforeUnload()).toBe(true)

    act(() => unmount())
    expect(dispatchBeforeUnload()).toBe(true)
  })
})

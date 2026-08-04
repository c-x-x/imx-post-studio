import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AccessibleDialog } from '../../src/app/AccessibleDialog'

describe('AccessibleDialog', () => {
  afterEach(cleanup)

  it('moves focus inside, traps Tab, closes on Escape, and restores its initiator', () => {
    const initiator = document.createElement('button')
    document.body.append(initiator)
    initiator.focus()
    const onClose = () => document.querySelector('[role="dialog"]')?.remove()
    render(<AccessibleDialog title="确认操作" onClose={onClose} returnFocus={() => initiator}><button type="button">取消</button><button type="button">确认</button></AccessibleDialog>)

    const dialog = screen.getByRole('dialog', { name: '确认操作' })
    const cancel = screen.getByRole('button', { name: '取消' })
    const confirm = screen.getByRole('button', { name: '确认' })
    expect(document.activeElement).toBe(cancel)
    confirm.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(initiator).toHaveFocus()
    initiator.remove()
  })
})

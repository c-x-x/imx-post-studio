import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AccessibleDialog, DialogClose } from '../../src/app/AccessibleDialog'

describe('AccessibleDialog', () => {
  afterEach(cleanup)

  it('escapes transformed workspace ancestors by portaling the backdrop to the document body', () => {
    const { container } = render(<div style={{ transform: 'translateX(18px)' }}><AccessibleDialog title="导入已验证" onClose={() => undefined}><button type="button">取消</button></AccessibleDialog></div>)

    const dialog = screen.getByRole('dialog', { name: '导入已验证' })
    const backdrop = dialog.parentElement
    expect(container).not.toContainElement(dialog)
    expect(backdrop).toHaveClass('modal-backdrop')
    expect(backdrop?.parentElement).toBe(document.body)
  })

  it('locks the document behind the dialog and restores scrolling after unmount', () => {
    const dialog = render(<AccessibleDialog title="设置" onClose={() => undefined}><button type="button">关闭</button></AccessibleDialog>)

    expect(document.documentElement).toHaveClass('dialog-open')
    expect(document.body).toHaveClass('dialog-open')
    dialog.unmount()
    expect(document.documentElement).not.toHaveClass('dialog-open')
    expect(document.body).not.toHaveClass('dialog-open')
  })

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

  it('routes a Cancel click through the same focus-restoring close path', () => {
    const initiator = document.createElement('button')
    document.body.append(initiator)
    let closed = false
    render(<AccessibleDialog title="取消测试" onClose={() => { closed = true }} returnFocus={() => initiator}><DialogClose>{(close) => <button type="button" onClick={close}>取消</button>}</DialogClose></AccessibleDialog>)

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(closed).toBe(true)
    expect(initiator).toHaveFocus()
    initiator.remove()
  })
})

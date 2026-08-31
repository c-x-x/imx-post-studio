import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImxLogo } from '../../src/app/ImxLogo'

describe('IMX logo snowfall', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows one full-screen snow layer for five seconds', () => {
    vi.useFakeTimers()
    const { container } = render(<ImxLogo />)

    fireEvent.click(container.querySelector('.imx-dock__logo-wrap')!)
    const snowfall = document.body.querySelector('[data-snowfall]')
    expect(snowfall).toBeInTheDocument()
    expect(snowfall?.children).toHaveLength(48)
    act(() => vi.advanceTimersByTime(4999))
    expect(document.body.querySelector('[data-snowfall]')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(document.body.querySelector('[data-snowfall]')).not.toBeInTheDocument()
  })

  it('restarts the same five-second window instead of stacking snow layers', () => {
    vi.useFakeTimers()
    const { container } = render(<ImxLogo />)
    const logo = container.querySelector('.imx-dock__logo-wrap')!

    fireEvent.click(logo)
    act(() => vi.advanceTimersByTime(3000))
    fireEvent.click(logo)
    expect(document.body.querySelectorAll('[data-snowfall]')).toHaveLength(1)
    act(() => vi.advanceTimersByTime(4999))
    expect(document.body.querySelector('[data-snowfall]')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(document.body.querySelector('[data-snowfall]')).not.toBeInTheDocument()
  })
})

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImxLogo } from '../../src/app/ImxLogo'

describe('IMX logo motion', () => {
  afterEach(() => {
    cleanup()
    document.documentElement.classList.remove('imps-distorted', 'imps-distorted--static', 'imps-distortion-entering')
    document.documentElement.style.removeProperty('--imps-distortion-x')
    document.documentElement.style.removeProperty('--imps-distortion-y')
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('accelerates while hovered and coasts to a stop after the pointer leaves', () => {
    const frames: FrameRequestCallback[] = []
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      frameId += 1
      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const { container } = render(<ImxLogo />)
    const logo = container.querySelector<HTMLElement>('.imx-dock__logo-wrap')
    expect(logo).not.toBeNull()

    fireEvent.mouseEnter(logo!)
    frames.shift()?.(0)
    frames.shift()?.(100)
    const acceleratedTransform = logo!.style.transform
    expect(acceleratedTransform).toMatch(/^rotate\([1-9]/)

    fireEvent.mouseLeave(logo!)
    frames.shift()?.(200)
    expect(logo!.style.transform).not.toBe(acceleratedTransform)

    let time = 216
    for (let index = 0; index < 600 && frames.length > 0; index += 1) {
      frames.shift()?.(time)
      time += 16
    }
    expect(frames).toHaveLength(0)
  })

  it('ramps from a slow turn to an uncontrolled spin across the five-second hold', () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const { container } = render(<ImxLogo />)
    const logo = container.querySelector<HTMLElement>('.imx-dock__logo-wrap')!
    const readAngle = () => Number.parseFloat(logo.style.transform.match(/-?[\d.]+/)?.[0] ?? '0')

    fireEvent.mouseEnter(logo)
    frames.shift()?.(0)
    let previousAngle = readAngle()
    const movement: number[] = []
    for (let index = 1; index <= 300; index += 1) {
      frames.shift()?.(index * 16)
      const nextAngle = readAngle()
      movement.push((nextAngle - previousAngle + 360) % 360)
      previousAngle = nextAngle
    }

    const firstSecond = movement.slice(0, 60).reduce((sum, value) => sum + value, 0)
    const finalSecond = movement.slice(-60).reduce((sum, value) => sum + value, 0)
    expect(firstSecond).toBeLessThan(180)
    expect(finalSecond).toBeGreaterThan(firstSecond * 15)
    expect(Number.parseFloat(logo.style.transform.match(/scale\(([\d.]+)/)?.[1] ?? '1')).toBeGreaterThan(2.15)
    fireEvent.mouseLeave(logo)
  })

  it('activates the persistent distortion only after an uninterrupted five-second hover', () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const { container, unmount } = render(<ImxLogo />)
    const logo = container.querySelector<HTMLElement>('.imx-dock__logo-wrap')!

    fireEvent.mouseEnter(logo)
    vi.advanceTimersByTime(4999)
    expect(document.documentElement).not.toHaveClass('imps-distorted')
    fireEvent.mouseLeave(logo)
    vi.advanceTimersByTime(1)
    expect(document.documentElement).not.toHaveClass('imps-distorted')

    fireEvent.mouseEnter(logo)
    vi.advanceTimersByTime(5000)
    expect(document.documentElement).toHaveClass('imps-distorted')
    expect(document.documentElement).toHaveClass('imps-distortion-entering')
    expect(document.documentElement.style.getPropertyValue('--imps-distortion-x')).toMatch(/px$/)
    frames.shift()?.(0)
    frames.shift()?.(100)
    const slowAngle = logo.style.transform
    fireEvent.mouseLeave(logo)
    frames.shift()?.(200)
    expect(logo.style.transform).not.toBe(slowAngle)
    vi.advanceTimersByTime(3800)
    expect(document.documentElement).not.toHaveClass('imps-distortion-entering')
    unmount()
    expect(document.documentElement).toHaveClass('imps-distorted')
  })
})

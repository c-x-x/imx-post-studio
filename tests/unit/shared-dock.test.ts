import { describe, expect, it } from 'vitest'
import { smoothStep } from '../../src/app/use-shared-dock'

describe('shared Dock attraction math', () => {
  it('clamps outside the interval and eases its midpoint deterministically', () => {
    expect(smoothStep(0.06, 0.78, -1)).toBe(0)
    expect(smoothStep(0.06, 0.78, 1)).toBe(1)
    expect(smoothStep(0.06, 0.78, 0.42)).toBeCloseTo(0.5)
  })

  it('returns a stable boundary when the interval has no width', () => {
    expect(smoothStep(1, 1, 0)).toBe(0)
    expect(smoothStep(1, 1, 1)).toBe(1)
  })
})

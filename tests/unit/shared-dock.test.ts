import { describe, expect, it } from 'vitest'
import { dockLayerPresence, resolveSharedDockParts, smoothStep } from '../../src/app/use-shared-dock'

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

  it('keeps separate glass parts intact until the shared shell can crossfade in', () => {
    expect(dockLayerPresence(0.25)).toEqual({ part: 1, shell: 0 })
    const midpoint = dockLayerPresence(0.65)
    expect(midpoint.part).toBeGreaterThan(0)
    expect(midpoint.shell).toBeGreaterThan(0)
    expect(dockLayerPresence(1)).toEqual({ part: 0, shell: 1 })
  })
})

describe('shared Dock structure', () => {
  it('resolves both Dock variants through semantic roles', () => {
    const root = document.createElement('nav')
    root.innerHTML = `
      <div data-shared-dock="container">
        <span data-shared-dock="shell"></span>
        <button data-shared-dock="left"></button>
        <div data-shared-dock="center"></div>
        <div data-shared-dock="right">
          <button data-shared-dock="action-control"></button>
        </div>
      </div>
    `

    const parts = resolveSharedDockParts(root)
    expect(parts?.container).toBe(root.querySelector('[data-shared-dock="container"]'))
    expect(parts?.left).toBe(root.querySelector('[data-shared-dock="left"]'))
    expect(parts?.center).toBe(root.querySelector('[data-shared-dock="center"]'))
    expect(parts?.right).toBe(root.querySelector('[data-shared-dock="right"]'))
    expect(parts?.actionControl).toBe(root.querySelector('[data-shared-dock="action-control"]'))
    expect(parts?.shell).toBe(root.querySelector('[data-shared-dock="shell"]'))
  })

  it('rejects incomplete Dock markup', () => {
    const root = document.createElement('nav')
    root.innerHTML = '<div data-shared-dock="container"></div>'
    expect(resolveSharedDockParts(root)).toBeUndefined()
  })
})

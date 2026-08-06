import { useEffect, type RefObject } from 'react'

// Adapted from hugo-theme-imx 6f08e8e assets/js/dock.js.
const DOCK_MERGE_ENTER = 0.88
const DOCK_MERGE_EXIT = 0.8

interface DockMetrics {
  actionsDistance: number
  actionsLead: number
  brandDistance: number
  groupFinalShift: number
  shellFinalCenter: number
  shellStartCenter: number
  shellStartScaleX: number
  shellWidth: number
}

interface DockMediaQuery {
  matches: boolean
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
}

export interface SharedDockParts {
  container: HTMLElement
  left: HTMLElement
  center: HTMLElement
  right: HTMLElement
  actionControl: HTMLElement
  shell: HTMLElement
}

export function resolveSharedDockParts(root: HTMLElement): SharedDockParts | undefined {
  const container = root.querySelector<HTMLElement>('[data-shared-dock="container"]')
  const left = root.querySelector<HTMLElement>('[data-shared-dock="left"]')
  const center = root.querySelector<HTMLElement>('[data-shared-dock="center"]')
  const right = root.querySelector<HTMLElement>('[data-shared-dock="right"]')
  const actionControl = root.querySelector<HTMLElement>('[data-shared-dock="action-control"]')
  const shell = root.querySelector<HTMLElement>('[data-shared-dock="shell"]')
  if (!container || !left || !center || !right || !actionControl || !shell) return undefined
  return { container, left, center, right, actionControl, shell }
}

export function smoothStep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1
  const point = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1)
  return point * point * (3 - 2 * point)
}

export function dockLayerPresence(attraction: number): { part: number; shell: number } {
  return {
    part: 1 - smoothStep(0.5, 0.98, attraction),
    shell: smoothStep(0.42, 0.92, attraction),
  }
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount
}

function mediaQuery(value: string): DockMediaQuery {
  return typeof window.matchMedia === 'function' ? window.matchMedia(value) : { matches: false }
}

function listenToMediaQuery(query: DockMediaQuery, listener: () => void): () => void {
  query.addEventListener?.('change', listener)
  return () => query.removeEventListener?.('change', listener)
}

export function useSharedDock(navRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const parts = resolveSharedDockParts(nav)
    if (!parts) return
    const {
      container,
      center: menu,
      left: brand,
      right: actions,
      actionControl,
    } = parts
    const scrollElement = nav.closest<HTMLElement>('[data-shared-dock-scroll]')
    const scrollTarget: Window | HTMLElement = scrollElement ?? window

    const mobileQuery = mediaQuery('(max-width: 768px)')
    const reduceMotionQuery = mediaQuery('(prefers-reduced-motion: reduce)')
    let frame = 0
    let merged = false
    let metricsDirty = true
    let metrics: DockMetrics | undefined
    let lastAttraction = -1
    let lastBrandShift = '0px'
    let lastActionsShift = '0px'
    let lastGroupShift = '0px'
    let lastShellWidth = '0px'
    let lastVisualKey = ''

    const refreshMetrics = (): DockMetrics => {
      const menuRect = menu.getBoundingClientRect()
      const brandRect = brand.getBoundingClientRect()
      const actionsRect = actions.getBoundingClientRect()
      const actionControlRect = actionControl.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const currentBrandShift = Number.parseFloat(lastBrandShift) || 0
      const currentActionsShift = Number.parseFloat(lastActionsShift) || 0
      const currentGroupShift = Number.parseFloat(lastGroupShift) || 0
      const visualGap = Math.max(10, Math.min(18, window.innerWidth * 0.014))
      const containerLeft = containerRect.left - currentGroupShift
      const containerRight = containerRect.right - currentGroupShift
      const brandLeft = brandRect.left - currentBrandShift - currentGroupShift
      const brandRight = brandRect.right - currentBrandShift - currentGroupShift
      const actionsLeft = actionsRect.left - currentActionsShift - currentGroupShift
      const actionsRight = actionsRect.right - currentActionsShift - currentGroupShift
      const menuLeft = menuRect.left - currentGroupShift
      const menuRight = menuRect.right - currentGroupShift
      const brandDistance = Math.max(0, menuLeft - brandRight - visualGap)
      const actionsDistance = Math.max(0, actionsLeft - menuRight - visualGap)
      const widthRatio = actionControlRect.width > 0 ? brandRect.width / actionControlRect.width : 1
      const actionsLead = Math.min(1.62, Math.max(1.12, 1 + (widthRatio - 1) * 0.18))
      const finalBrandLeft = brandLeft + brandDistance
      const finalBrandRight = brandRight + brandDistance
      const finalActionsLeft = actionsLeft - actionsDistance
      const finalActionsRight = actionsRight - actionsDistance
      const shellFinalLeft = Math.max(containerLeft, Math.min(finalBrandLeft, menuLeft, finalActionsLeft) - 1)
      const shellFinalRight = Math.min(containerRight, Math.max(finalBrandRight, menuRight, finalActionsRight) + 1)
      const shellWidth = Math.max(1, shellFinalRight - shellFinalLeft)
      const shellStartWidth = Math.min(shellWidth, Math.max(1, menuRight - menuLeft + 2))
      const shellFinalCenter = (shellFinalLeft + shellFinalRight) / 2
      const containerCenter = (containerLeft + containerRight) / 2
      const shellWidthValue = `${shellWidth.toFixed(2)}px`
      if (shellWidthValue !== lastShellWidth) {
        lastShellWidth = shellWidthValue
        nav.style.setProperty('--home-dock-shell-width', shellWidthValue)
      }
      metricsDirty = false
      metrics = {
        actionsDistance,
        actionsLead,
        brandDistance,
        groupFinalShift: containerCenter - shellFinalCenter,
        shellFinalCenter: shellFinalCenter - containerLeft,
        shellStartCenter: (menuLeft + menuRight) / 2 - containerLeft,
        shellStartScaleX: shellStartWidth / shellWidth,
        shellWidth,
      }
      return metrics
    }

    const getMetrics = () => metricsDirty || !metrics ? refreshMetrics() : metrics

    const writeVisualState = (attraction: number) => {
      const { part: partPresence, shell: shellPresence } = dockLayerPresence(attraction)
      const shellOpacity = attraction <= 0.002 ? 0 : shellPresence
      const shellScaleY = 0.9 + smoothStep(0.42, 0.92, attraction) * 0.1
      const key = [
        attraction.toFixed(3), shellOpacity.toFixed(3), shellScaleY.toFixed(4),
        (0.8 * partPresence).toFixed(3), (0.14 * partPresence).toFixed(3),
        (0.11 * partPresence).toFixed(3), partPresence.toFixed(3),
      ].join('|')
      if (key === lastVisualKey) return
      lastVisualKey = key
      nav.style.setProperty('--home-dock-attraction', attraction.toFixed(3))
      nav.style.setProperty('--home-dock-shell-opacity', shellOpacity.toFixed(3))
      nav.style.setProperty('--home-dock-shell-scale-y', shellScaleY.toFixed(4))
      nav.style.setProperty('--home-dock-part-scale', '1.0000')
      nav.style.setProperty('--home-dock-part-bg-alpha', (0.8 * partPresence).toFixed(3))
      nav.style.setProperty('--home-dock-part-border-alpha', (0.14 * partPresence).toFixed(3))
      nav.style.setProperty('--home-dock-part-shadow-alpha', (0.11 * partPresence).toFixed(3))
      nav.style.setProperty('--home-dock-part-overlay-alpha', partPresence.toFixed(3))
    }

    const writeAttraction = (attraction: number, currentMetrics: DockMetrics) => {
      const normalized = Math.round(Math.min(Math.max(attraction, 0), 1) * 1000) / 1000
      writeVisualState(normalized)
      if (normalized === lastAttraction) return
      lastAttraction = normalized
      const actionsAttraction = 1 - Math.pow(1 - normalized, currentMetrics.actionsLead)
      const shellBlend = smoothStep(0.03, 0.9, normalized)
      const brandShift = `${(currentMetrics.brandDistance * normalized).toFixed(2)}px`
      const actionsShift = `${(-currentMetrics.actionsDistance * actionsAttraction).toFixed(2)}px`
      const groupShift = `${(currentMetrics.groupFinalShift * shellBlend).toFixed(2)}px`
      const shellCenter = lerp(currentMetrics.shellStartCenter, currentMetrics.shellFinalCenter, shellBlend)
      const shellScaleX = lerp(currentMetrics.shellStartScaleX, 1, shellBlend).toFixed(4)
      const shellX = `${(shellCenter - currentMetrics.shellWidth / 2).toFixed(2)}px`
      nav.style.setProperty('--home-dock-brand-shift', brandShift)
      nav.style.setProperty('--home-dock-actions-shift', actionsShift)
      nav.style.setProperty('--home-dock-group-shift', groupShift)
      nav.style.setProperty('--home-dock-shell-scale-x', shellScaleX)
      nav.style.setProperty('--home-dock-shell-x', shellX)
      lastBrandShift = brandShift
      lastActionsShift = actionsShift
      lastGroupShift = groupShift
      nav.classList.toggle('is-dock-attracting', !merged && normalized > 0.002 && normalized < 0.998)
    }

    const reset = () => {
      lastAttraction = -1
      lastVisualKey = ''
      writeVisualState(0)
      nav.style.setProperty('--home-dock-brand-shift', '0px')
      nav.style.setProperty('--home-dock-actions-shift', '0px')
      nav.style.setProperty('--home-dock-group-shift', '0px')
      nav.style.setProperty('--home-dock-shell-scale-x', '1.0000')
      nav.style.setProperty('--home-dock-shell-x', '0px')
      lastBrandShift = '0px'
      lastActionsShift = '0px'
      lastGroupShift = '0px'
      nav.classList.remove('is-dock-attracting')
    }

    const sync = () => {
      frame = 0
      if (mobileQuery.matches) {
        merged = false
        nav.classList.remove('is-dock-merged')
        document.body.classList.remove('imx-dock-merged')
        reset()
        return
      }
      const scrollTop = scrollElement?.scrollTop ?? window.scrollY
      const viewportHeight = scrollElement?.clientHeight ?? window.innerHeight
      const progress = scrollTop / Math.max(viewportHeight, 1)
      const nextMerged = merged ? progress > DOCK_MERGE_EXIT : progress >= DOCK_MERGE_ENTER
      const attraction = reduceMotionQuery.matches
        ? (nextMerged ? 1 : 0)
        : smoothStep(0.06, 0.78, progress)
      writeAttraction(attraction, getMetrics())
      if (merged !== nextMerged) {
        merged = nextMerged
        nav.classList.toggle('is-dock-merged', merged)
        document.body.classList.toggle('imx-dock-merged', merged)
      }
    }

    const requestSync = () => {
      if (!frame) frame = window.requestAnimationFrame(sync)
    }
    const invalidate = () => {
      metricsDirty = true
      lastAttraction = -1
      requestSync()
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(invalidate)
    resizeObserver?.observe(container)
    resizeObserver?.observe(menu)
    resizeObserver?.observe(brand)
    resizeObserver?.observe(actions)
    scrollTarget.addEventListener('scroll', requestSync, { passive: true })
    window.addEventListener('resize', invalidate)
    const removeMobileListener = listenToMediaQuery(mobileQuery, invalidate)
    const removeMotionListener = listenToMediaQuery(reduceMotionQuery, requestSync)
    requestSync()

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      scrollTarget.removeEventListener('scroll', requestSync)
      window.removeEventListener('resize', invalidate)
      removeMobileListener()
      removeMotionListener()
      nav.classList.remove('is-dock-attracting', 'is-dock-merged')
      document.body.classList.remove('imx-dock-merged')
    }
  }, [navRef])
}

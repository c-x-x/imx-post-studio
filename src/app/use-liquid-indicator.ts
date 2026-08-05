import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

interface IndicatorState {
  center: number
  width: number
  targetCenter: number
  targetWidth: number
  velocity: number
  widthVelocity: number
  lift: number
  liftTarget: number
  liftVelocity: number
  direction: number
  initialized: boolean
  pointerTracking: boolean
  frame: number
  lastFrameTime: number
}

interface SpringResult {
  value: number
  velocity: number
}

interface Metric {
  center: number
  width: number
}

const initialState = (): IndicatorState => ({
  center: 0,
  width: 0,
  targetCenter: 0,
  targetWidth: 0,
  velocity: 0,
  widthVelocity: 0,
  lift: 0,
  liftTarget: 0,
  liftVelocity: 0,
  direction: 0,
  initialized: false,
  pointerTracking: false,
  frame: 0,
  lastFrameTime: 0,
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function advanceSpring(value: number, velocity: number, target: number, frequency: number, dampingRatio: number, deltaTime: number): SpringResult {
  const omega = Math.max(0.001, frequency * Math.PI * 2)
  const zeta = Math.max(0.001, dampingRatio)
  const time = clamp(deltaTime, 0, 0.08)
  const displacement = value - target
  if (time === 0) return { value, velocity }

  if (zeta < 1) {
    const dampedOmega = omega * Math.sqrt(1 - zeta * zeta)
    const decay = Math.exp(-zeta * omega * time)
    const cos = Math.cos(dampedOmega * time)
    const sin = Math.sin(dampedOmega * time)
    const c2 = (velocity + zeta * omega * displacement) / dampedOmega
    const nextDisplacement = decay * (displacement * cos + c2 * sin)
    return {
      value: target + nextDisplacement,
      velocity: decay * (-zeta * omega * (displacement * cos + c2 * sin) + (-displacement * dampedOmega * sin + c2 * dampedOmega * cos)),
    }
  }

  const decay = Math.exp(-omega * time)
  const c2 = velocity + omega * displacement
  return {
    value: target + (displacement + c2 * time) * decay,
    velocity: (velocity - omega * c2 * time) * decay,
  }
}

function isDesktop(): boolean {
  return typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 768px)').matches
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function metricFor(menu: HTMLElement, control: HTMLElement): Metric | undefined {
  const menuRect = menu.getBoundingClientRect()
  const controlRect = control.getBoundingClientRect()
  if (controlRect.width <= 0) return undefined
  const borderLeft = Number.parseFloat(window.getComputedStyle(menu).borderLeftWidth) || 0
  const origin = menuRect.left + borderLeft
  const left = controlRect.left - origin
  return { center: left + controlRect.width / 2, width: controlRect.width }
}

function setVisual(menu: HTMLElement, state: IndicatorState): void {
  const menuRect = menu.getBoundingClientRect()
  const areaWidth = Math.max(menuRect.width, state.targetWidth)
  const distance = state.targetCenter - state.center
  const stretchLimit = Math.min(areaWidth * 0.34, Math.max(state.targetWidth * 1.4, 56))
  const stretch = reducedMotion() ? 0 : clamp(Math.abs(distance) * 1.05 + Math.abs(state.velocity) * 0.016, 0, stretchLimit)
  const renderedWidth = Math.min(Math.max(state.width, 1) + stretch, areaWidth + 8)
  const baseWidth = Math.max(state.targetWidth, 1)
  const renderedCenter = state.center + distance * 0.5
  const visualLeft = clamp(renderedCenter - renderedWidth / 2, -4, Math.max(-4, areaWidth - renderedWidth + 4))
  const left = visualLeft + renderedWidth / 2 - baseWidth / 2
  const direction = Math.abs(distance) > 0.35 ? Math.sign(distance) : Math.abs(state.velocity) > 6 ? Math.sign(state.velocity) : state.direction
  const energy = clamp(stretch / Math.max(state.targetWidth * 1.1, 1), 0, 1)
  const lift = clamp(state.lift, 0, 1.12)
  const scaleX = clamp(renderedWidth / baseWidth, 0.72, 2.35)
  const scaleY = 1 + lift * 0.105 + lift * energy * 0.07
  state.direction = direction || state.direction
  menu.style.setProperty('--indicator-x', `${left.toFixed(2)}px`)
  menu.style.setProperty('--indicator-width', `${baseWidth.toFixed(2)}px`)
  menu.style.setProperty('--indicator-scale-x', scaleX.toFixed(4))
  menu.style.setProperty('--indicator-scale-y', scaleY.toFixed(4))
  menu.style.setProperty('--indicator-skew', `${(direction * lift * energy * -2.4).toFixed(2)}deg`)
  menu.style.setProperty('--indicator-edge-opacity', (lift * (0.22 + energy * 0.5)).toFixed(3))
  menu.style.setProperty('--indicator-opacity', state.initialized ? '1' : '0')
}

function startAnimation(menu: HTMLElement, state: IndicatorState): void {
  if (state.frame || reducedMotion()) {
    if (reducedMotion()) {
      state.center = state.targetCenter
      state.width = state.targetWidth
      state.lift = state.liftTarget
      setVisual(menu, state)
    }
    return
  }
  const animate = (timestamp: number) => {
    const elapsed = state.lastFrameTime ? timestamp - state.lastFrameTime : 16.667
    const deltaTime = clamp(elapsed / 1000, 1 / 120, 1 / 24)
    const center = advanceSpring(state.center, state.velocity, state.targetCenter, state.pointerTracking ? 7.6 : 6.2, state.pointerTracking ? 0.74 : 0.78, deltaTime)
    const width = advanceSpring(state.width, state.widthVelocity, state.targetWidth, state.pointerTracking ? 6.2 : 5.4, state.pointerTracking ? 0.78 : 0.82, deltaTime)
    const lift = advanceSpring(state.lift, state.liftVelocity, state.liftTarget, 5.2, 0.82, deltaTime)
    state.center = center.value
    state.velocity = center.velocity
    state.width = width.value
    state.widthVelocity = width.velocity
    state.lift = lift.value
    state.liftVelocity = lift.velocity
    state.lastFrameTime = timestamp
    setVisual(menu, state)
    const settled = Math.abs(state.targetCenter - state.center) < 0.04 && Math.abs(state.targetWidth - state.width) < 0.04 && Math.abs(state.velocity) < 3 && Math.abs(state.widthVelocity) < 3 && Math.abs(state.liftTarget - state.lift) < 0.002 && Math.abs(state.liftVelocity) < 0.08
    if (settled) {
      state.center = state.targetCenter
      state.width = state.targetWidth
      state.velocity = 0
      state.widthVelocity = 0
      state.lift = state.liftTarget
      state.liftVelocity = 0
      state.frame = 0
      state.lastFrameTime = 0
      setVisual(menu, state)
    } else {
      state.frame = window.requestAnimationFrame(animate)
    }
  }
  state.frame = window.requestAnimationFrame(animate)
}

export function useLiquidIndicator(menuRef: RefObject<HTMLUListElement | null>, activeKey: string): void {
  const stateRef = useRef<IndicatorState>(initialState())

  useLayoutEffect(() => {
    const menu = menuRef.current
    const active = menu?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!menu || !active) return
    menu.dataset.liquidIndicator = 'ready'
    if (!isDesktop()) {
      menu.style.setProperty('--indicator-opacity', '0')
      return
    }
    const metric = metricFor(menu, active)
    if (!metric) return
    const state = stateRef.current
    const instant = !state.initialized || reducedMotion()
    const centerDelta = metric.center - state.targetCenter
    const widthDelta = metric.width - state.targetWidth
    state.targetCenter = metric.center
    state.targetWidth = metric.width
    if (instant) {
      state.center = metric.center
      state.width = metric.width
      state.velocity = 0
      state.widthVelocity = 0
      state.initialized = true
      setVisual(menu, state)
      return
    }
    state.velocity += clamp(centerDelta * 4.2, -760, 760)
    state.widthVelocity += clamp(widthDelta * 2.8, -420, 420)

    startAnimation(menu, state)
  }, [activeKey, menuRef])

  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const state = stateRef.current
    const mobileQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 768px)') : undefined
    let pointerFrame = 0
    const controls = () => Array.from(menu.querySelectorAll<HTMLElement>('button[aria-current]'))
    const pointAt = (clientX: number) => {
      if (!isDesktop()) return
      const candidates = controls().map((control) => ({ control, metric: metricFor(menu, control) })).filter((item): item is { control: HTMLElement; metric: Metric } => Boolean(item.metric))
      if (candidates.length === 0) return
      const menuRect = menu.getBoundingClientRect()
      const localX = clamp(clientX - menuRect.left, candidates[0].metric.center, candidates[candidates.length - 1].metric.center)
      let left = candidates[0].metric
      let right = candidates[candidates.length - 1].metric
      for (let index = 0; index < candidates.length - 1; index += 1) {
        if (localX >= candidates[index].metric.center && localX <= candidates[index + 1].metric.center) {
          left = candidates[index].metric
          right = candidates[index + 1].metric
          break
        }
      }
      const distance = right.center - left.center
      const ratio = distance === 0 ? 0 : clamp((localX - left.center) / distance, 0, 1)
      state.targetCenter = localX
      state.targetWidth = left.width + (right.width - left.width) * ratio
    }
    const enter = (event: PointerEvent) => {
      if (!isDesktop() || event.pointerType === 'touch') return
      state.pointerTracking = true
      state.liftTarget = 1
      menu.classList.add('is-indicator-lifted')
      pointAt(event.clientX)
      startAnimation(menu, state)
    }
    const move = (event: PointerEvent) => {
      if (!state.pointerTracking || event.pointerType === 'touch' || pointerFrame) return
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0
        pointAt(event.clientX)
        startAnimation(menu, state)
      })
    }
    const leave = () => {
      state.pointerTracking = false
      state.liftTarget = 0
      menu.classList.remove('is-indicator-lifted')
      const active = menu.querySelector<HTMLElement>('[aria-current="page"]')
      const metric = active ? metricFor(menu, active) : undefined
      if (metric) {
        state.targetCenter = metric.center
        state.targetWidth = metric.width
      }
      startAnimation(menu, state)
    }
    const refresh = () => {
      if (mobileQuery?.matches) {
        menu.style.setProperty('--indicator-opacity', '0')
        return
      }
      const active = menu.querySelector<HTMLElement>('[aria-current="page"]')
      const metric = active ? metricFor(menu, active) : undefined
      if (!metric) return
      state.initialized = true
      state.center = metric.center
      state.targetCenter = metric.center
      state.width = metric.width
      state.targetWidth = metric.width
      setVisual(menu, state)
    }
    menu.addEventListener('pointerenter', enter)
    menu.addEventListener('pointermove', move)
    menu.addEventListener('pointerleave', leave)
    menu.addEventListener('pointercancel', leave)
    window.addEventListener('resize', refresh)
    mobileQuery?.addEventListener?.('change', refresh)
    return () => {
      menu.removeEventListener('pointerenter', enter)
      menu.removeEventListener('pointermove', move)
      menu.removeEventListener('pointerleave', leave)
      menu.removeEventListener('pointercancel', leave)
      window.removeEventListener('resize', refresh)
      mobileQuery?.removeEventListener?.('change', refresh)
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame)
      if (state.frame) window.cancelAnimationFrame(state.frame)
      state.frame = 0
      state.lastFrameTime = 0
      delete menu.dataset.liquidIndicator
    }
  }, [menuRef])
}

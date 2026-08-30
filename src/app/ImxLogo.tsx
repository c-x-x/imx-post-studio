import { useEffect, useRef } from 'react'

const rotations = [0, 60, 120, 180, 240, 300]
const INITIAL_SPIN_SPEED = 72
const MAX_SPIN_SPEED = 4320
const DISTORTED_SPIN_SPEED = 108
const SPIN_RAMP_POWER = 2.6
const CONTROL_LOSS_START = .7
const CONTROL_LOSS_SCALE = 1.62
const ACCELERATION = 7
const DECELERATION = 2
const STOP_SPEED = .5
const DISTORTION_HOLD_MS = 5000
const DISTORTION_ENTRY_MS = 3800
const DISTORTION_RAMP_MS = 650

function Snowflake() {
  return <g transform="translate(32 32)" fill="none" stroke="currentColor" strokeWidth="2.85" strokeLinecap="round" strokeLinejoin="round">
    {rotations.map((rotation) => <g key={rotation} transform={rotation === 0 ? undefined : `rotate(${rotation})`}>
      <path d="M0-5.5v-25 M0-11.2l-6.1-4.8 M0-11.2l6.1-4.8 M0-18.8l-6.7-5.1 M0-18.8l6.7-5.1" />
    </g>)}
    <circle cx="0" cy="0" r="5.1" />
  </g>
}

export function ImxLogo() {
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const frameRef = useRef<number | undefined>(undefined)
  const lastFrameRef = useRef<number | undefined>(undefined)
  const angleRef = useRef(0)
  const speedRef = useRef(0)
  const scaleRef = useRef(1)
  const hoveringRef = useRef(false)
  const hoverStartedAtRef = useRef<number | undefined>(undefined)
  const distortionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const distortedRef = useRef(document.documentElement.classList.contains('imps-distorted'))

  const clearDistortionTimer = () => {
    if (distortionTimerRef.current === undefined) return
    clearTimeout(distortionTimerRef.current)
    distortionTimerRef.current = undefined
  }

  const activateDistortion = () => {
    distortionTimerRef.current = undefined
    if (distortedRef.current) return
    distortedRef.current = true
    const root = document.documentElement
    const bounds = wrapperRef.current?.getBoundingClientRect()
    if (bounds) {
      root.style.setProperty('--imps-distortion-x', `${bounds.left + bounds.width / 2}px`)
      root.style.setProperty('--imps-distortion-y', `${bounds.top + bounds.height / 2}px`)
    }
    root.classList.add('imps-distorted')
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('imps-distorted--static')
      return
    }
    speedRef.current = DISTORTED_SPIN_SPEED
    const ramp = document.getElementById('imps-site-distortion-ramp') as (Element & { beginElement?: () => void }) | null
    const displacement = document.getElementById('imps-site-displacement')
    if (typeof ramp?.beginElement === 'function') ramp.beginElement()
    else window.setTimeout(() => displacement?.setAttribute('scale', '18'), DISTORTION_RAMP_MS)
    root.classList.add('imps-distortion-entering')
    window.setTimeout(() => root.classList.remove('imps-distortion-entering'), DISTORTION_ENTRY_MS)
  }

  const animate = (time: number) => {
    const lastFrame = lastFrameRef.current ?? time
    const elapsed = Math.min((time - lastFrame) / 1000, .05)
    let targetSpeed = 0
    let controlLoss = 0
    if (distortedRef.current) {
      targetSpeed = DISTORTED_SPIN_SPEED
    } else if (hoveringRef.current) {
      const hoverStartedAt = hoverStartedAtRef.current ?? time
      hoverStartedAtRef.current = hoverStartedAt
      const progress = Math.min(Math.max((time - hoverStartedAt) / DISTORTION_HOLD_MS, 0), 1)
      targetSpeed = INITIAL_SPIN_SPEED + (MAX_SPIN_SPEED - INITIAL_SPIN_SPEED) * progress ** SPIN_RAMP_POWER
      controlLoss = Math.min(Math.max((progress - CONTROL_LOSS_START) / (1 - CONTROL_LOSS_START), 0), 1)
    }
    const response = targetSpeed > speedRef.current ? ACCELERATION : DECELERATION
    const easing = 1 - Math.exp(-response * elapsed)
    speedRef.current += (targetSpeed - speedRef.current) * easing
    angleRef.current = (angleRef.current + speedRef.current * elapsed) % 360
    const targetScale = 1 + CONTROL_LOSS_SCALE * controlLoss ** 1.35
    const scaleResponse = targetScale > scaleRef.current ? 8 : 2.2
    scaleRef.current += (targetScale - scaleRef.current) * (1 - Math.exp(-scaleResponse * elapsed))
    const jitterStrength = controlLoss ** 2 * 10
    const jitterX = Math.sin(time * .071) * jitterStrength
    const jitterY = Math.cos(time * .053) * jitterStrength
    const visualAngle = angleRef.current + Math.sin(time * .113) * controlLoss ** 2 * 9
    const visualScale = scaleRef.current + Math.sin(time * .041) * controlLoss ** 2 * .16
    lastFrameRef.current = time
    wrapperRef.current?.style.setProperty('transform', `rotate(${visualAngle}deg) translate3d(${jitterX}px, ${jitterY}px, 0) scale(${visualScale})`)

    if (distortedRef.current || hoveringRef.current || speedRef.current > STOP_SPEED || Math.abs(scaleRef.current - 1) > .001) {
      frameRef.current = requestAnimationFrame(animate)
      return
    }

    speedRef.current = 0
    lastFrameRef.current = undefined
    frameRef.current = undefined
  }

  const startSpin = () => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!reducedMotion) {
      hoveringRef.current = true
      hoverStartedAtRef.current = undefined
      if (frameRef.current === undefined) frameRef.current = requestAnimationFrame(animate)
    }
    if (!distortedRef.current && distortionTimerRef.current === undefined) {
      distortionTimerRef.current = setTimeout(activateDistortion, DISTORTION_HOLD_MS)
    }
  }

  const slowToStop = () => {
    hoveringRef.current = false
    hoverStartedAtRef.current = undefined
    clearDistortionTimer()
  }

  useEffect(() => {
    const onWindowBlur = () => {
      hoveringRef.current = false
      hoverStartedAtRef.current = undefined
      clearDistortionTimer()
    }
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('blur', onWindowBlur)
      clearDistortionTimer()
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return <span ref={wrapperRef} className="imx-dock__logo-wrap" aria-hidden="true" onMouseEnter={startSpin} onMouseLeave={slowToStop}>
    <svg className="imx-dock__logo" viewBox="0 0 64 64" focusable="false"><Snowflake /></svg>
  </span>
}

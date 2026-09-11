import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

const rotations = [0, 60, 120, 180, 240, 300]
const SNOW_DURATION_MS = 5000
const SNOWFLAKE_COUNT = 48

function snowSample(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

interface SnowflakeStyle extends CSSProperties {
  '--snow-x': string
  '--snow-drift': string
  '--snow-drift-end': string
  '--snow-size': string
  '--snow-opacity': number
  '--snow-duration': string
  '--snow-delay': string
  '--snow-y': string
  '--snow-blur': string
}

const snowfall = Array.from({ length: SNOWFLAKE_COUNT }, (_, index) => {
  const sample = (salt: number) => snowSample(index, salt)
  const drift = Math.round(12 + sample(2) * 38)
  const depth = sample(3)
  const style: SnowflakeStyle = {
    '--snow-x': `${sample(1) * 100}vw`,
    '--snow-drift': `${drift}px`,
    '--snow-drift-end': `${Math.round(drift * 1.6)}px`,
    '--snow-size': `${(1.5 + depth * 4).toFixed(1)}px`,
    '--snow-opacity': .25 + depth * .5,
    '--snow-duration': `${(3.3 + sample(5) * .8).toFixed(2)}s`,
    '--snow-delay': `${(sample(6) * .7).toFixed(2)}s`,
    '--snow-y': `${(-8 + sample(7) * 72).toFixed(1)}%`,
    '--snow-blur': `${depth > .8 ? .65 : .15}px`,
  }
  return { id: index, style }
})

function Snowflake() {
  return <g transform="translate(32 32)" fill="none" stroke="currentColor" strokeWidth="2.85" strokeLinecap="round" strokeLinejoin="round">
    {rotations.map((rotation) => <g key={rotation} transform={rotation === 0 ? undefined : `rotate(${rotation})`}>
      <path d="M0-5.5v-25 M0-11.2l-6.1-4.8 M0-11.2l6.1-4.8 M0-18.8l-6.7-5.1 M0-18.8l6.7-5.1" />
    </g>)}
    <circle cx="0" cy="0" r="5.1" />
  </g>
}

export function ImxLogo() {
  const [snowBurst, setSnowBurst] = useState(0)
  const snowTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const startSnowfall = () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    setSnowBurst((burst) => burst + 1)
    clearTimeout(snowTimerRef.current)
    snowTimerRef.current = setTimeout(() => setSnowBurst(0), SNOW_DURATION_MS)
  }

  useEffect(() => () => clearTimeout(snowTimerRef.current), [])

  return <>
    <span className="imx-dock__logo-wrap" aria-hidden="true" onClick={startSnowfall}>
      <span className="imx-dock__logo-motion">
        <svg className="imx-dock__logo" viewBox="0 0 64 64" focusable="false"><Snowflake /></svg>
      </span>
    </span>
    {snowBurst > 0 ? createPortal(<div key={snowBurst} className="imx-snowfall" data-snowfall aria-hidden="true">
      {snowfall.map((flake) => <span key={flake.id} className="imx-snowfall__flake" style={flake.style} />)}
    </div>, document.body) : null}
  </>
}

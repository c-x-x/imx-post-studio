import type { CSSProperties } from 'react'

const rotations = [0, 60, 120, 180, 240, 300]

function Snowflake({ animated }: { animated: boolean }) {
  let index = 0
  return <g transform="translate(32 32)" fill="none" stroke="currentColor" strokeWidth="2.85" strokeLinecap="round" strokeLinejoin="round">
    {rotations.map((rotation) => <g key={rotation} transform={rotation === 0 ? undefined : `rotate(${rotation})`}>
      {['M0-5.5v-25', 'M0-11.2l-6.1-4.8', 'M0-11.2l6.1-4.8', 'M0-18.8l-6.7-5.1', 'M0-18.8l6.7-5.1'].map((path) => {
        const pathIndex = index
        index += 1
        return <path key={path} d={path} style={animated ? ({ '--i': pathIndex } as CSSProperties) : undefined} />
      })}
    </g>)}
    <circle className={animated ? 'imx-dock__logo-ink-dot' : undefined} cx="0" cy="0" r="5.1" />
  </g>
}

export function ImxLogo() {
  return <span className="imx-dock__logo-wrap" aria-hidden="true">
    <svg className="imx-dock__logo" viewBox="0 0 64 64" focusable="false"><Snowflake animated={false} /></svg>
    <svg className="imx-dock__logo-ink" viewBox="0 0 64 64" focusable="false"><Snowflake animated /></svg>
  </span>
}

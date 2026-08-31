const rotations = [0, 60, 120, 180, 240, 300]

function Snowflake() {
  return <g transform="translate(32 32)" fill="none" stroke="currentColor" strokeWidth="2.85" strokeLinecap="round" strokeLinejoin="round">
    {rotations.map((rotation) => <g key={rotation} transform={rotation === 0 ? undefined : `rotate(${rotation})`}>
      <path d="M0-5.5v-25 M0-11.2l-6.1-4.8 M0-11.2l6.1-4.8 M0-18.8l-6.7-5.1 M0-18.8l6.7-5.1" />
    </g>)}
    <circle cx="0" cy="0" r="5.1" />
  </g>
}

export function ImxLogo() {
  return <span className="imx-dock__logo-wrap" aria-hidden="true">
    <svg className="imx-dock__logo" viewBox="0 0 64 64" focusable="false"><Snowflake /></svg>
  </span>
}

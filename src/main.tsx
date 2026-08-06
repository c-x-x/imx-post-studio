import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/app.css'
import './app/imx-theme-parity.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)

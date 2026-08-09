import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/app.css'
import './app/studio-surfaces.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)

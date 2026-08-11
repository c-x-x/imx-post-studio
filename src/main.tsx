import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { extractFontFaces } from './preview/font-faces'
import previewCss from './preview/studio-preview.css?raw'
import './app/app.css'
import './app/studio-surfaces.css'

const fontStyle = document.createElement('style')
fontStyle.dataset.studioFonts = ''
fontStyle.textContent = extractFontFaces(previewCss)
document.head.append(fontStyle)

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)

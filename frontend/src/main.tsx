import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/400-italic.css'
import './styles/tokens.css'
import './styles/global.css'
import App from './App'

// Apply the theme before first paint: saved choice, else OS preference.
const saved = localStorage.getItem('flowtwin-theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.dataset.theme =
  saved === 'dark' || saved === 'light' ? saved : prefersDark ? 'dark' : 'light'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

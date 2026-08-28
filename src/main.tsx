import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { trackViewport } from '@/lib/viewport'
import { watchForUpdates } from '@/lib/update'
import './index.css'

trackViewport()
watchForUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

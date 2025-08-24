import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // Assuming you might have global styles here
import App from './App' // Changed from App.tsx to App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

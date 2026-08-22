import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from './app/providers'
import { router } from './app/router'
import { applyCachedTheme } from './lib/useTheme'
import './index.css'

// Before the first paint: the saved theme arrives over the network, and
// without this the page renders in the built-in colours and then visibly
// repaints once that request lands.
applyCachedTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)

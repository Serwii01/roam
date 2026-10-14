import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './lib/auth'
import { MISCONFIGURED } from './lib/api'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
})

const root = createRoot(document.getElementById('root')!)

if (MISCONFIGURED) {
  // Despliegue sin VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: mejor un aviso claro que una app que no guarda nada.
  root.render(
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 520, margin: '15vh auto', padding: 24, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22 }}>ROAM no está configurado</h1>
      <p>
        Faltan las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en este despliegue. Añádelas en el panel del
        hosting (en Vercel: Settings → Environment Variables) y vuelve a desplegar.
      </p>
    </div>,
  )
} else root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)

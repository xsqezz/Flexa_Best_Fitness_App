import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { validatePublicBackendConfiguration } from '../shared/configuration.ts'
import { pwa } from './pwa/plugin.ts'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, import.meta.dirname, 'VITE_')
  const pagesDemo = mode === 'pages'
  if (pagesDemo && (environment.VITE_SUPABASE_URL?.trim() || environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim())) {
    throw new Error('GitHub Pages publikuje tylko lokalne demo, bez konfiguracji backendu i kluczy.')
  }
  const error = validatePublicBackendConfiguration(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (error) throw new Error(`Niepoprawna publiczna konfiguracja backendu: ${error}`)
  const catalogHash = createHash('sha256')
    .update(readFileSync(join(import.meta.dirname, 'public', 'data', 'polish-products.json')))
    .digest('hex')
  return {
    plugins: [react(), pwa({ hashRouter: pagesDemo, catalogHash })],
    define: {
      'import.meta.env.VITE_PAGES_DEMO': JSON.stringify(pagesDemo ? 'true' : 'false'),
      'import.meta.env.VITE_POLISH_CATALOG_HASH': JSON.stringify(catalogHash),
    },
    server: { host: '127.0.0.1', port: 5173 },
    preview: { host: '127.0.0.1', port: 4173 },
  }
})

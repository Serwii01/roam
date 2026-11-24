// Pruebas de pantallas en modo demo (npm run test:e2e). Arranca su propio servidor: nunca usa la base de producción.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  use: { baseURL: 'http://localhost:5199', locale: 'es-ES', screenshot: 'only-on-failure' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'node node_modules/vite/bin/vite.js --mode demo --port 5199 --strictPort', url: 'http://localhost:5199', reuseExistingServer: false, timeout: 60_000 },
})

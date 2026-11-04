// Aparte de vite.config.ts: los tests son de lógica y no necesitan React, Tailwind ni la PWA.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})

// Tests de la lógica de `src/lib` (en Node) y de pantallas (*.test.tsx, en jsdom). Va aparte de vite.config.ts para no cargar la PWA ni Tailwind.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})

import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  assetsInclude: ['**/*.musicxml'],
  resolve: {
    alias: {
      '@core/tat/runtime': fileURLToPath(new URL('./tat/browser.ts', import.meta.url)),
      'core/tat/runtime': fileURLToPath(new URL('./tat/browser.ts', import.meta.url)),
      '@core/tat': fileURLToPath(new URL('./tat', import.meta.url)),
      'core/tat': fileURLToPath(new URL('./tat', import.meta.url)),
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})

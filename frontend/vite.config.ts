import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // relative base so the built prototype runs from any static host or file path
  base: './',
  resolve: {
    alias: {
      '@seed': fileURLToPath(new URL('../data/seed', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    fs: {
      // allow importing the committed seed JSON that lives one level above the app root
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
})

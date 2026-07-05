import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Answers /api/live-status so the client knows which live planes have keys
    without the keys ever reaching the bundle. nginx mirrors this in deploy/. */
function liveStatusPlugin(gemini: boolean, nvidia: boolean): Plugin {
  return {
    name: 'flowtwin-live-status',
    configureServer(server) {
      server.middlewares.use('/api/live-status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ gemini, nvidia }))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  const env = loadEnv(mode, dir, 'FLOWTWIN_')
  const geminiKey = env.FLOWTWIN_GEMINI_KEY ?? ''
  const nvidiaKey = env.FLOWTWIN_NVIDIA_KEY ?? ''

  return {
    plugins: [react(), liveStatusPlugin(Boolean(geminiKey), Boolean(nvidiaKey))],
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
      proxy: {
        // /api/gemini/* → Gemini API; the key is appended server-side only
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: (p) => {
            const path = p.replace(/^\/api\/gemini/, '/v1beta')
            return path + (path.includes('?') ? '&' : '?') + 'key=' + geminiKey
          },
        },
        // /api/nvidia/* → NVIDIA API catalog; bearer added server-side only
        '/api/nvidia': {
          target: 'https://integrate.api.nvidia.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/nvidia/, '/v1'),
          headers: { Authorization: `Bearer ${nvidiaKey}` },
        },
      },
    },
  }
})

import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'happy-dom', setupFiles: ['./src/test/setup.ts'], css: false },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: { usePolling: true }, // reliable hot reload inside Docker
    proxy: { '/api': { target } }, // same-origin => session cookie + CSRF just work
  },
})

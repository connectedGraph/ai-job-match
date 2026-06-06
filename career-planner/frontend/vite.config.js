import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const env = globalThis.process?.env || {}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: env.VITE_API_TARGET || 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
})

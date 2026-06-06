import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const jobApiTarget = process.env.JOB_ADMIN_API_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: jobApiTarget,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})

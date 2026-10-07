import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Only the backoffice CRM under src/admin uses this; the marketing site
      // keeps its plain relative imports and its CSS modules.
      '@admin': path.resolve(import.meta.dirname, './src/admin'),
    },
  },
})

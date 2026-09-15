import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './pwa.config.js'

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  server: {
    port: 5176,
    host: true,
    allowedHosts: ['192.168.1.34.nip.io'],
    proxy: {
      '/api': 'http://localhost:3004',
      '/uploads': 'http://localhost:3004',
    },
  },
})

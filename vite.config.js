import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './pwa.config.js'
import { normalizeBuildId, BUILD_ID_FILE } from './logic/app-build.js'

// This build's id: the git short sha (when there is one) and the build time.
// The app script carries it as __APP_BUILD__; dist/build-id.txt gives it to
// the server, which sends it on API answers.
function gitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}
const APP_BUILD = normalizeBuildId([gitShortSha(), Date.now().toString(36)].filter(Boolean).join('-'))

const writeBuildId = {
  name: 'app-build-id',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: BUILD_ID_FILE, source: APP_BUILD })
  },
}

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions), writeBuildId],
  define: {
    __APP_BUILD__: JSON.stringify(APP_BUILD),
  },
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

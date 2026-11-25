import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Identificador de cada build. La app lo compara con /version.json publicado
// para saber si hay una versión nueva y recargarse sola.
const APP_VERSION = new Date().toISOString()

function versionFile(): Plugin {
  return {
    name: 'rey-pez-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: APP_VERSION }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/rey-pez-camaras/',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [react(), versionFile()],
})

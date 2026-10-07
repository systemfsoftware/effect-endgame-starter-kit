import { defineConfig } from 'vite'

import { siteWorker } from './site-worker.ts'
import { SITE_DEV_PORT, sitePlugins } from './vite-plugins.ts'

export default defineConfig({
  plugins: sitePlugins(siteWorker.main),
  server: { host: '127.0.0.1', port: SITE_DEV_PORT, strictPort: true },
  preview: { host: '127.0.0.1', port: SITE_DEV_PORT, strictPort: true },
})

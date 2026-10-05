import { defineConfig } from 'vite'

import { siteWorker } from './site-worker.ts'
import { SITE_DEV_PORT, sitePlugins } from './vite-plugins.ts'

export default defineConfig(({ command }) => ({
  plugins: sitePlugins(siteWorker.main, command === 'serve' ? { OTLP_BASE_URL: siteWorker.localOtlpBaseUrl } : {}),
  server: { host: '127.0.0.1', port: SITE_DEV_PORT, strictPort: true },
  preview: { host: '127.0.0.1', port: SITE_DEV_PORT, strictPort: true },
}))

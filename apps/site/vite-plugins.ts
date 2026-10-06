import { cloudflare } from '@cloudflare/vite-plugin'
import babel from '@rolldown/plugin-babel'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'

import { readmeOpening } from './readme-opening-plugin.ts'
import { siteWorker } from './site-worker.ts'

export const SITE_DEV_PORT = 1337

export const sitePlugins = (main: string) => [
  cloudflare({
    viteEnvironment: { name: 'ssr' },
    config: {
      name: siteWorker.name,
      main,
      compatibility_date: siteWorker.compatibilityDate,
      compatibility_flags: [...siteWorker.compatibilityFlags],
    },
  }),
  readmeOpening(),
  tanstackStart(),
  viteReact(),
  babel({ presets: [reactCompilerPreset()] }),
]

import babel from '@rolldown/plugin-babel'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { readmeOpening } from './readme-opening-plugin.ts'

export default defineConfig({
  plugins: [readmeOpening(), tanstackStart(), viteReact(), babel({ presets: [reactCompilerPreset()] })],
})

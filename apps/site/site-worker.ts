export const siteWorker = {
  name: 'endgame-site',
  main: 'src/worker.ts',
  compatibilityDate: '2026-10-05',
  compatibilityFlags: ['webcrypto_modern_algorithms'],
} as const

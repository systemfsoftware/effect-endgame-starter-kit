import { defineConfig, type ViteUserConfig } from 'vitest/config'

type Aliases = NonNullable<NonNullable<ViteUserConfig['resolve']>['alias']>

export const packageTestConfig = (alias: Aliases): ViteUserConfig =>
  defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    },
    resolve: { alias },
  })

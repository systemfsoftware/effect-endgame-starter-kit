import { packageTestConfig } from '../../vitest.shared.ts'

const srcUrl = (module: string): string => new URL(`./src/${module}`, import.meta.url).pathname

export default packageTestConfig([{ find: /^@TODO\/starter$/, replacement: srcUrl('index.ts') }])
